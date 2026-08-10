import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { prisma } from '~/a2/db.server';
import { getSessionUser } from '~/a2/session.server';

/*
 * A2 project-plaza (D6, task 5.1 / WB-10): owner-only public visibility toggle.
 *   POST /api/a2/projects/:id/visibility   body: { isPublic: boolean }
 * Publishing requires a file snapshot so the visitor view has something to
 * boot; without one the request is rejected with Chinese guidance and the
 * project stays private. Non-owners and anonymous requests are refused (404 /
 * 401) to avoid leaking existence.
 */

export async function action({ params, request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await getSessionUser(request, env);

  if (!user) {
    return json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405 });
  }

  const mixedId = params.id;

  if (!mixedId) {
    return json({ error: 'Project not found.' }, { status: 404 });
  }

  const project = await prisma.project.findFirst({
    where: {
      userId: user.id,
      OR: [{ id: mixedId }, { urlId: mixedId }],
    },
    select: { id: true, fileSnapshot: true },
  });

  if (!project) {
    return json({ error: 'Project not found.' }, { status: 404 });
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const isPublic = Boolean(body.isPublic);

  // WB-10: publishing needs a snapshot so visitors have something to boot.
  if (isPublic && !project.fileSnapshot) {
    return json({ error: '请先在聊天页右上角点击"保存"生成快照，再公开到广场' }, { status: 409 });
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { isPublic },
    select: { id: true, urlId: true, isPublic: true },
  });

  return json(updated);
}
