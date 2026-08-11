import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { getSessionUser } from '~/a2/session.server';

/**
 * Component Island: submit a Wan3 text-to-image task to DashScope.
 * POST /api/island/generate  { prompt: string }  →  { taskId: string }
 */

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com';

const SYSTEM_PROMPT =
  'A high-quality screenshot of a desktop with beautifully designed widgets: ' +
  'calendar, clock, photo wall, sticky notes, weather widget. ' +
  'Modern flat design, soft pastel colors, rounded corners, clean layout. ' +
  'Theme described by user: ';

export async function action({ request, context }: ActionFunctionArgs) {
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

  // Parse request body
  let body: { prompt?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const userPrompt = (body.prompt || '').trim();

  if (!userPrompt) {
    return Response.json({ error: '请输入描述内容。' }, { status: 400 });
  }

  const fullPrompt = SYSTEM_PROMPT + userPrompt;

  // Submit async task to DashScope Wan3 (wanx2.1-t2i-turbo) API
  let upstream: Response;

  try {
    upstream = await fetch(`${DASHSCOPE_BASE}/api/v1/services/aigc/text2image/image-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'wanx2.1-t2i-turbo',
        input: { prompt: fullPrompt },
        parameters: { size: '1280*720', n: 1 },
      }),
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

  const result = (await upstream.json()) as { output?: { task_id?: string } };
  const taskId = result?.output?.task_id;

  if (!taskId) {
    return Response.json({ error: 'DashScope did not return a task_id.' }, { status: 502 });
  }

  return Response.json({ taskId });
}
