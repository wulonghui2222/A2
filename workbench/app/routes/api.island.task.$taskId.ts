import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getSessionUser } from '~/a2/session.server';

/**
 * Component Island: poll a DashScope async task by ID.
 * GET /api/island/task/:taskId  →  { status, imageUrl?, message? }
 */

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com';

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;

  // Auth check
  const user = await getSessionUser(request, env);

  if (!user) {
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const apiKey = env.BAILIAN_API_KEY;

  if (!apiKey) {
    return Response.json({ error: 'Platform LLM credential (BAILIAN_API_KEY) is not configured.' }, { status: 503 });
  }

  const taskId = params.taskId;

  if (!taskId) {
    return Response.json({ error: 'Missing taskId parameter.' }, { status: 400 });
  }

  // Query task status from DashScope
  let upstream: Response;

  try {
    upstream = await fetch(`${DASHSCOPE_BASE}/api/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (error: any) {
    return Response.json({ error: `Upstream request failed: ${error?.message || error}` }, { status: 502 });
  }

  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => '');
    return new Response(errBody || JSON.stringify({ error: 'Upstream error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = (await upstream.json()) as {
    output?: {
      task_status?: string;
      results?: Array<{ url?: string }>;
      message?: string;
    };
  };
  const output = result?.output;
  const taskStatus = output?.task_status as string | undefined;

  if (!taskStatus) {
    return Response.json({ status: 'UNKNOWN' });
  }

  // SUCCEEDED: extract image URL from results array (old API format)
  if (taskStatus === 'SUCCEEDED') {
    const results = output?.results as Array<{ url?: string }> | undefined;
    const imageUrl = results?.[0]?.url || null;

    return Response.json({ status: 'SUCCEEDED', imageUrl });
  }

  // FAILED: extract error message
  if (taskStatus === 'FAILED') {
    return Response.json({
      status: 'FAILED',
      message: output?.message || '图片生成失败，请重试。',
    });
  }

  // PENDING or RUNNING
  return Response.json({ status: taskStatus });
}
