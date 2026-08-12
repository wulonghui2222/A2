import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { prisma } from '~/a2/db.server';
import { getSessionUser } from '~/a2/session.server';

// A2 (design D4, task 3.2): project collection routes.
// GET  /api/projects      -> list (no messages), newest first (WB-07 feed)
// POST /api/projects      -> create empty project; server allocates id/urlId

const UNAUTHENTICATED = () => json({ error: 'Authentication required.' }, { status: 401 });

/** Generate a 16-character random hex string (64 bits of entropy). */
function generateUrlId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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

  // A2: urlId is a server-generated random hex string (no collision possible).
  const urlId = generateUrlId();
  const project = await prisma.project.create({
    data: { urlId, description, userId: user.id },
    select: { id: true, urlId: true, description: true, createdAt: true, updatedAt: true },
  });

  return json(project, { status: 201 });
}
