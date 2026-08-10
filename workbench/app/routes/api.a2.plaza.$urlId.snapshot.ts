import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { prisma } from '~/a2/db.server';

/*
 * A2 project-plaza (D3, task 4.1): public file-snapshot endpoint. No auth
 * required; only public projects expose their snapshot so the plaza visitor
 * view can boot a preview. Non-public, missing, or snapshot-less projects all
 * return 404 to avoid leaking existence (PL-02).
 *
 * The stored snapshot is a flat `{ relativePath: content }` JSON string (see
 * app/a2/persistence/db.ts collectFileSnapshot). We hand it back parsed so the
 * client can feed it straight into the mount step.
 */
const NOT_FOUND = () => json({ error: 'Project not found.' }, { status: 404 });

export async function loader({ params }: LoaderFunctionArgs) {
  const urlId = params.urlId;

  if (!urlId) {
    return NOT_FOUND();
  }

  const project = await prisma.project.findFirst({
    where: { urlId, isPublic: true },
    select: { fileSnapshot: true },
  });

  if (!project || !project.fileSnapshot) {
    return NOT_FOUND();
  }

  try {
    return json({ snapshot: JSON.parse(project.fileSnapshot) });
  } catch {
    // Corrupted snapshot: treat it as unusable rather than leaking raw bytes.
    return NOT_FOUND();
  }
}
