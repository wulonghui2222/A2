import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { prisma } from '~/a2/db.server';
import { getSessionUser } from '~/a2/session.server';

// A2 (design D4, task 3.2): project collection routes.
// GET  /api/projects      -> list (no messages), newest first (WB-07 feed)
// POST /api/projects      -> create empty project; server allocates id/urlId

const UNAUTHENTICATED = () => json({ error: 'Authentication required.' }, { status: 401 });

/** bolt-style slug collision handling: append -2, -3, ... until free. */
async function allocateUrlId(base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;

  while (await prisma.project.findUnique({ where: { urlId: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix++}`;
  }

  return candidate;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await getSessionUser(request, env);

  if (!user) {
    return UNAUTHENTICATED();
  }

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, urlId: true, description: true, createdAt: true, updatedAt: true },
  });

  return json(projects);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await getSessionUser(request, env);

  if (!user) {
    return UNAUTHENTICATED();
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405 });
  }

  let body: any = {};

  try {
    body = await request.json();
  } catch {
    // Empty body is fine: everything is optional at creation time.
  }

  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : undefined;
  const requestedSlug = typeof body.urlId === 'string' && body.urlId.trim() ? body.urlId.trim() : `chat-${Date.now().toString(36)}`;

  // A2: slugs are global (URL routing), so collisions get bolt-style suffixes.
  const urlId = await allocateUrlId(requestedSlug);
  const project = await prisma.project.create({
    data: { urlId, description, userId: user.id },
    select: { id: true, urlId: true, description: true, createdAt: true, updatedAt: true },
  });

  return json(project, { status: 201 });
}
