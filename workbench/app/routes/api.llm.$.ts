import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getSessionUser } from '~/a2/session.server';

/**
 * A2 (design D5, specs LG-01 ~ LG-03): platform LLM gateway.
 *
 * OpenAI-compatible streaming proxy to the Aliyun Bailian compatible-mode
 * endpoint. The platform credential (BAILIAN_API_KEY) is injected server-side
 * only; whatever Authorization header the client sends is discarded.
 *
 * Catch-all by design: bolt's OpenAI SDK appends `/chat/completions` or
 * `/models` to the configured base URL (`/api/llm`).
 */

const UPSTREAM_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

function openAIError(status: number, message: string, type = 'a2_gateway_error', code?: string) {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type,
        ...(code ? { code } : {}),
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

async function forwardToUpstream(args: ActionFunctionArgs | LoaderFunctionArgs) {
  const { context, request } = args;
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;

  // A2 (task 2.3 / LG-03): no valid session -> 401 without touching upstream.
  // Exception: server-side self-calls (api.chat -> /api/llm) present the
  // internal token instead of a session cookie.
  const internalCall =
    !!env.A2_INTERNAL_TOKEN && request.headers.get('x-a2-internal') === env.A2_INTERNAL_TOKEN;

  if (!internalCall && !(await getSessionUser(request, env))) {
    return openAIError(401, 'Authentication required.', 'authentication_error');
  }

  const apiKey = env.BAILIAN_API_KEY;

  // LG-02: missing platform credential -> 5xx, no upstream call.
  if (!apiKey) {
    return openAIError(503, 'Platform LLM credential (BAILIAN_API_KEY) is not configured.', 'configuration_error');
  }

  const url = new URL(request.url);
  const subPath = url.pathname.replace(/^\/api\/llm/, '') || '/chat/completions';

  // NB: string concat, not new URL(path, base) -- URL() would drop the last
  // base segment (/v1) when the subpath starts with '/'.
  const upstreamUrl = new URL(UPSTREAM_BASE.replace(/\/$/, '') + subPath + url.search);

  const headers = new Headers();
  headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
  headers.set('Authorization', `Bearer ${apiKey}`);

  let upstream: Response;

  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    });
  } catch (error: any) {
    return openAIError(502, `Upstream request failed: ${error?.message || error}`);
  }

  // LG-01 scenario 2: propagate upstream errors in OpenAI-compatible shape.
  // Bailian already speaks the OpenAI error format, so pass the body through.
  if (!upstream.ok) {
    let body: string;

    try {
      body = await upstream.text();
    } catch {
      body = '';
    }

    return new Response(body || JSON.stringify({ error: { message: 'Upstream error', type: 'upstream_error' } }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // SSE (stream=true) or plain JSON -- both are passed through unchanged.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function action(args: ActionFunctionArgs) {
  return forwardToUpstream(args);
}

export async function loader(args: LoaderFunctionArgs) {
  return forwardToUpstream(args);
}
