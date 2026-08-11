import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getSessionUser } from '~/a2/session.server';

/**
 * Component Island: proxy a DashScope result image so the browser loads it
 * from same origin (avoids OSS hotlink / cross-origin / mixed-content issues).
 * GET /api/island/image?url=<encoded oss url>  →  image bytes
 */

// Only allow proxying DashScope / Aliyun OSS result URLs (SSRF guard).
function isAllowedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith('.aliyuncs.com');
  } catch {
    return false;
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;

  const user = await getSessionUser(request, env);

  if (!user) {
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const target = new URL(request.url).searchParams.get('url');

  if (!target || !isAllowedHost(target)) {
    return Response.json({ error: 'Invalid image url.' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(target);
  } catch (error: any) {
    return Response.json({ error: `Upstream request failed: ${error?.message || error}` }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: 'Failed to fetch image.' }, { status: 502 });
  }

  const contentType = upstream.headers.get('Content-Type') || 'image/png';

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,

      // Result URLs are valid 24h; cache briefly to avoid re-downloading on re-render.
      'Cache-Control': 'private, max-age=300',
    },
  });
}
