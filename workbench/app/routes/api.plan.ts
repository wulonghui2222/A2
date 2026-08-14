/*
 * add-multi-agent-team (task 2.1, design D3/D14): PD planning endpoint.
 * Authenticated, read-only (never touches the workspace), streams the PD
 * answer back as an AI SDK data-stream so the client can render plan steps
 * incrementally. Supports first-generation (selection + plan) and
 * incremental (plan only, project context injected) modes.
 */
import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { A2_DEFAULT_MODEL } from '~/a2/config';
import { getSessionUser } from '~/a2/session.server';
import { buildPdFirstGenPrompt, buildPdIncrementalPrompt, type PdPlanStepContext } from '~/a2/multi-agent/pd-planner';
import { dashScopeStreamText } from '~/lib/.server/llm/dashscope-stream';
import { MAX_TOKENS } from '~/lib/.server/llm/constants';
import { STARTER_TEMPLATES } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.plan');

export async function action(args: ActionFunctionArgs) {
  return planAction(args);
}

async function planAction({ context, request }: ActionFunctionArgs) {
  // MA-01: planning requires an authenticated session (same pattern as api.chat).
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;

  if (!(await getSessionUser(request, env))) {
    return new Response(JSON.stringify({ error: 'Authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { mode, message, feedback, fileTree, currentPlan } = await request.json<{
    mode: 'first' | 'incremental';
    message: string;
    feedback?: string;
    fileTree?: string[];
    currentPlan?: PdPlanStepContext[];
  }>();

  if (!message || typeof message !== 'string') {
    throw new Response('Invalid or missing message', { status: 400, statusText: 'Bad Request' });
  }

  let system: string;

  if (mode === 'incremental') {
    system = buildPdIncrementalPrompt({ fileTree: fileTree ?? [], currentPlan: currentPlan ?? [] });
  } else {
    // same template set as selectStarterTemplate: shadcn variants excluded
    const templates = STARTER_TEMPLATES.filter((t) => !t.name.includes('shadcn'));
    system = buildPdFirstGenPrompt(templates);
  }

  const userContent = feedback?.trim() ? `${message}\n\n用户反馈：${feedback.trim()}` : message;

  try {
    const result = dashScopeStreamText({
      model: A2_DEFAULT_MODEL,
      system,
      maxTokens: MAX_TOKENS,
      messages: [{ role: 'user', content: userContent }],
      env: context.cloudflare.env,
    });

    return new Response(result.toDataStream(), {
      status: 200,
      headers: {
        contentType: 'text/event-stream',
        connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    logger.error(error);

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
