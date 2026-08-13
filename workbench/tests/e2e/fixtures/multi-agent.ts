import type { Page } from '@playwright/test';
import { dataStreamBody } from './llm-stream';

/*
 * add-multi-agent-team (task 7.1): deterministic stubs for the multi-agent
 * team flow. The team-mode browser path hits:
 *   POST /api/plan     -> PD planning stream (selection + plan sections)
 *   POST /api/chat     -> one scripted generation round per TL step
 *   POST /api/llmcall  -> triage answer when a system prompt is present,
 *                         blank starter-template selection otherwise
 * `/api/llm/**` is intercepted defensively, same as llm-stream.ts.
 *
 * The plan stub always selects `blank` so the approve handoff never reaches
 * GitHub for starter templates, keeping the suite hermetic.
 */

export const STUB_PLAN_STEPS = ['创建页面基础结构', '添加标题与正文内容', '补充基础样式'];

export const STUB_DIRECT_INTRO = '好的，我直接为你生成。';

export interface MultiAgentCounters {
  plan: number;
  chat: number;
  llmcall: number;
  triage: number;

  /** Parsed /api/plan request bodies, in call order. */
  planRequests: Array<Record<string, unknown> | null>;
}

export function createCounters(): MultiAgentCounters {
  return { plan: 0, chat: 0, llmcall: 0, triage: 0, planRequests: [] };
}

/** PD wire output: selection + plan sections (incremental omits selection). */
export function pdPlanOutput(steps: string[], withSelection: boolean): string {
  const selection = withSelection
    ? '<selection><templateName>blank</templateName><title>E2E 演示项目</title></selection>\n'
    : '';
  const plan = `<plan>\n${steps.map((step) => `<step>${step}</step>`).join('\n')}\n</plan>`;

  return selection + plan;
}

/** One Engineer round: intro text plus a boltArtifact with a single file action. */
export function stepArtifactMessage(step: number): string {
  return [
    `已完成步骤 ${step}。`,
    '',
    `<boltArtifact id="e2e-step-${step}" title="E2E 步骤 ${step}">`,
    `<boltAction type="file" filePath="step-${step}.html">`,
    `<!doctype html><h1>Step ${step}</h1>`,
    '</boltAction>',
    '</boltArtifact>',
  ].join('\n');
}

export type ChatScriptEntry = { kind: 'ok'; text: string } | { kind: 'fail' };

export const chatOk = (text: string): ChatScriptEntry => ({ kind: 'ok', text });
export const chatFail: ChatScriptEntry = { kind: 'fail' };

export interface MultiAgentStubOptions {
  /** `fail` answers 500, `unparseable` streams text without a plan section. */
  plan?: 'ok' | 'fail' | 'unparseable';
  planSteps?: string[];

  /** One entry per /api/chat call; the last entry repeats when exhausted. */
  chatScript: ChatScriptEntry[];

  /** Triage answer for /api/llmcall calls carrying a system prompt. */
  triage?: 'trivial' | 'major' | 'fail';
}

/**
 * Mounts all multi-agent stubs on the page. Call before submitting the
 * prompt; returns counters so tests can assert which hops were hit.
 */
export async function mountMultiAgentStub(page: Page, options: MultiAgentStubOptions): Promise<MultiAgentCounters> {
  const { plan = 'ok', planSteps = STUB_PLAN_STEPS, chatScript, triage = 'trivial' } = options;
  const counters = createCounters();

  await page.route('**/api/plan', async (route) => {
    counters.plan += 1;

    let body: Record<string, unknown> | null = null;

    try {
      body = route.request().postDataJSON();
    } catch {
      // not JSON — irrelevant for the stub
    }

    counters.planRequests.push(body);

    if (plan === 'fail') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }

    if (plan === 'unparseable') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: dataStreamBody('抱歉，我暂时无法输出结构化计划。'),
      });
      return;
    }

    const incremental = body?.mode === 'incremental';

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: dataStreamBody(pdPlanOutput(planSteps, !incremental)),
    });
  });

  await page.route('**/api/chat', async (route) => {
    const index = counters.chat;
    counters.chat += 1;

    const entry = chatScript[Math.min(index, chatScript.length - 1)] ?? chatOk(stepArtifactMessage(index + 1));

    if (entry.kind === 'fail') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: dataStreamBody(entry.text),
    });
  });

  await page.route('**/api/llmcall', async (route) => {
    counters.llmcall += 1;

    let body: Record<string, unknown> | null = null;

    try {
      body = route.request().postDataJSON();
    } catch {
      // not JSON — treat as a selection call
    }

    // Triage calls carry the system prompt (task 2.3); selection calls do not.
    if (typeof body?.system === 'string' && body.system.length > 0) {
      counters.triage += 1;

      if (triage === 'fail') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: triage }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: '<selection><templateName>blank</templateName><title>E2E 演示项目</title></selection>',
      }),
    });
  });

  // Defensive: OpenAI-compatible gateway paths (model list etc.).
  await page.route('**/api/llm/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ object: 'list', data: [] }),
    }),
  );

  return counters;
}

/**
 * Runtime feature-flag override (task 1.1): the env flag defaults off, so
 * e2e enables multi-agent mode through the documented localStorage key.
 * Must be called before the first navigation.
 */
export async function enableMultiAgentFlag(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('a2-multi-agent-mode', 'on');
  });
}
