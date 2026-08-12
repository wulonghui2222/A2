import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { prisma } from '~/a2/db.server';
import { getSessionUser, type SessionUser } from '~/a2/session.server';

/*
 * A2 (design D4, task 3.2): single-project routes. The :id segment accepts the
 * project id OR the urlId slug (bolt resolves chats by either, WB-06).
 * GET    /api/projects/:id -> full record incl. messages
 * PUT    /api/projects/:id -> idempotent whole-record upsert (50ms-throttled
 *                             full-list writes from the client, see 1.4 notes)
 * DELETE /api/projects/:id -> remove project and messages (cascade)
 * Ownership is enforced on every path: foreign/unknown ids return 404 (WB-08).
 */

const UNAUTHENTICATED = () => json({ error: 'Authentication required.' }, { status: 401 });
const NOT_FOUND = () => json({ error: 'Project not found.' }, { status: 404 });

/*
 * A2 project-plaza (D2): hard cap for the file snapshot payload. The client
 * skips oversized snapshots itself; this guard rejects crafted requests.
 */
const FILE_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;

async function findOwnedProject(mixedId: string, user: SessionUser) {
  return prisma.project.findFirst({
    where: {
      userId: user.id,
      OR: [{ id: mixedId }, { urlId: mixedId }],
    },
  });
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await getSessionUser(request, env);

  if (!user) {
    return UNAUTHENTICATED();
  }

  const project = await findOwnedProject(params.id!, user);

  if (!project) {
    return NOT_FOUND();
  }

  const rows = await prisma.message.findMany({
    where: { projectId: project.id },
    orderBy: { seq: 'asc' },
    select: { content: true },
  });

  /*
   * Rows store the whole ai-SDK message as JSON (keeps [Model:]/[Provider:]
   * prefixes verbatim; stripping is a render-time concern only).
   */
  const messages = rows.map((row: { content: string }) => {
    try {
      return JSON.parse(row.content);
    } catch {
      return { role: 'assistant', content: row.content };
    }
  });

  return json({
    id: project.id,
    urlId: project.urlId,
    description: project.description,
    messages,
    fileSnapshot: (project as any).fileSnapshot ?? null,

    /*
     * A2 plaza-card-thumbnails (D7): the workbench publish button needs the
     * current visibility to render its initial state.
     */
    isPublic: (project as any).isPublic ?? false,
    timestamp: project.updatedAt.toISOString(),
  });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await getSessionUser(request, env);

  if (!user) {
    return UNAUTHENTICATED();
  }

  const project = await findOwnedProject(params.id!, user);

  if (!project) {
    return NOT_FOUND();
  }

  if (request.method === 'DELETE') {
    await prisma.project.delete({ where: { id: project.id } });

    return json({ ok: true });
  }

  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed.' }, { status: 405 });
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  /*
   * A2 project-plaza (task 5.3): messages are optional on PUT. The explicit
   * "save" button posts a snapshot-only payload; absent/invalid messages must
   * keep the stored list intact (a naive delete-then-insert would wipe it).
   */
  const hasMessages = Array.isArray(body.messages);
  const messages: any[] = hasMessages ? body.messages : [];
  const description =
    typeof body.description === 'string' && body.description.trim() ? body.description.trim() : project.description;

  /*
   * A2 project-plaza (D2): optional file tree snapshot. Field absent means
   * "keep the previous value"; oversized payloads are rejected outright.
   */
  let fileSnapshot: string | undefined;

  if (body.fileSnapshot !== undefined) {
    if (typeof body.fileSnapshot !== 'string') {
      return json({ error: 'Invalid fileSnapshot payload.' }, { status: 400 });
    }

    if (new TextEncoder().encode(body.fileSnapshot).byteLength > FILE_SNAPSHOT_MAX_BYTES) {
      return json({ error: '文件快照过大（超过 2MB），请精简项目内容后再试' }, { status: 413 });
    }

    fileSnapshot = body.fileSnapshot;
  }

  /*
   * Idempotent full replace: delete-then-insert inside one transaction so the
   * 50ms-throttled client writes never leave a half-written message list.
   * Snapshot-only saves (no messages field) skip the message rewrite.
   *
   * urlId is a server-generated random hex string assigned at creation time;
   * it never changes, so no collision resolution is needed on PUT.
   */
  await prisma.$transaction([
    ...(hasMessages
      ? [
          prisma.message.deleteMany({ where: { projectId: project.id } }),
          prisma.message.createMany({
            data: messages.map((message, seq) => ({
              projectId: project.id,
              seq,
              role: typeof message?.role === 'string' ? message.role : 'assistant',
              content: JSON.stringify(message),
            })),
          }),
        ]
      : []),
    prisma.project.update({
      where: { id: project.id },
      data: { description, ...(fileSnapshot !== undefined ? { fileSnapshot } : {}) },
    }),
  ]);

  const updated = await prisma.project.findUnique({
    where: { id: project.id },
    select: { id: true, urlId: true, description: true, createdAt: true, updatedAt: true },
  });

  return json(updated);
}
