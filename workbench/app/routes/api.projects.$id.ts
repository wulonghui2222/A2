import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { prisma } from '~/a2/db.server';
import { getSessionUser, type SessionUser } from '~/a2/session.server';

// A2 (design D4, task 3.2): single-project routes. The :id segment accepts the
// project id OR the urlId slug (bolt resolves chats by either, WB-06).
// GET    /api/projects/:id -> full record incl. messages
// PUT    /api/projects/:id -> idempotent whole-record upsert (50ms-throttled
//                             full-list writes from the client, see 1.4 notes)
// DELETE /api/projects/:id -> remove project and messages (cascade)
// Ownership is enforced on every path: foreign/unknown ids return 404 (WB-08).

const UNAUTHENTICATED = () => json({ error: 'Authentication required.' }, { status: 401 });
const NOT_FOUND = () => json({ error: 'Project not found.' }, { status: 404 });

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

  // Rows store the whole ai-SDK message as JSON (keeps [Model:]/[Provider:]
  // prefixes verbatim; stripping is a render-time concern only).
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

  const messages: any[] = Array.isArray(body.messages) ? body.messages : [];
  const description =
    typeof body.description === 'string' && body.description.trim() ? body.description.trim() : project.description;
  const urlId = typeof body.urlId === 'string' && body.urlId.trim() ? body.urlId.trim() : project.urlId;

  try {
    // Idempotent full replace: delete-then-insert inside one transaction so the
    // 50ms-throttled client writes never leave a half-written message list.
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { projectId: project.id } }),
      prisma.message.createMany({
        data: messages.map((message, seq) => ({
          projectId: project.id,
          seq,
          role: typeof message?.role === 'string' ? message.role : 'assistant',
          content: JSON.stringify(message),
        })),
      }),
      prisma.project.update({
        where: { id: project.id },
        data: { description, urlId },
      }),
    ]);
  } catch (error: any) {
    // P2002: urlId grabbed by another project mid-flight.
    if (error?.code === 'P2002') {
      return json({ error: 'Slug already in use.' }, { status: 409 });
    }

    throw error;
  }

  const updated = await prisma.project.findUnique({
    where: { id: project.id },
    select: { id: true, urlId: true, description: true, createdAt: true, updatedAt: true },
  });

  return json(updated);
}
