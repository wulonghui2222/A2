import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { prisma } from '~/a2/db.server';
import { getSessionUser } from '~/a2/session.server';

/*
 * A2 plaza-card-thumbnails (D3/D4): captured runtime screenshot storage.
 *   POST /api/a2/projects/:id/thumbnail   body: { thumbnail: base64 JPEG }
 *     Owner-only upload (same session pattern as the visibility route); the
 *     decoded image is capped at 200KB (413 above, mirroring the fileSnapshot
 *     guard). Re-publishing overwrites the previous capture.
 *   GET  /api/a2/projects/:id/thumbnail
 *     Serves the JPEG for public projects only; non-public or capture-less
 *     projects return 404 so existence is not leaked (same as snapshot route).
 */

const THUMBNAIL_MAX_BYTES = 200 * 1024;

// Early reject: 200KB of binary is ~267K chars of base64.
const THUMBNAIL_MAX_BASE64_CHARS = Math.ceil((THUMBNAIL_MAX_BYTES / 3) * 4) + 1024;

const NOT_FOUND = () => json({ error: 'Project not found.' }, { status: 404 });

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
    return NOT_FOUND();
  }

  // Ownership first: foreign ids look exactly like missing ones.
  const project = await prisma.project.findFirst({
    where: {
      userId: user.id,
      OR: [{ id: mixedId }, { urlId: mixedId }],
    },
    select: { id: true },
  });

  if (!project) {
    return NOT_FOUND();
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const thumbnail: unknown = body?.thumbnail;

  if (typeof thumbnail !== 'string' || thumbnail.length === 0) {
    return json({ error: 'Missing thumbnail payload.' }, { status: 400 });
  }

  if (thumbnail.length > THUMBNAIL_MAX_BASE64_CHARS) {
    return json({ error: '缩略图过大（超过 200KB）' }, { status: 413 });
  }

  let bytes: Uint8Array;

  try {
    /*
     * Strip an optional data URL prefix (capture sends a raw base64 string,
     * but tolerate `data:image/jpeg;base64,` just in case).
     */
    const raw = thumbnail.replace(/^data:image\/[a-z]+;base64,/, '');
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: 'Invalid base64 payload.' }, { status: 400 });
  }

  if (bytes.byteLength === 0 || bytes.byteLength > THUMBNAIL_MAX_BYTES) {
    return json({ error: '缩略图过大（超过 200KB）' }, { status: 413 });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { thumbnail },
  });

  return json({ ok: true });
}

export async function loader({ params }: LoaderFunctionArgs) {
  const mixedId = params.id;

  if (!mixedId) {
    return NOT_FOUND();
  }

  const project = await prisma.project.findFirst({
    where: { OR: [{ id: mixedId }, { urlId: mixedId }], isPublic: true },
    select: { thumbnail: true },
  });

  if (!project || !project.thumbnail) {
    return NOT_FOUND();
  }

  let bytes: Uint8Array;

  try {
    const raw = project.thumbnail.replace(/^data:image\/[a-z]+;base64,/, '');
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return NOT_FOUND();
  }

  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
