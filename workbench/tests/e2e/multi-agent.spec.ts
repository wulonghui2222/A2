import { expect, test } from '@playwright/test';
import { mountLlmStub, STUB_INTRO_TEXT } from './fixtures/llm-stream';
import {
  chatFail,
  chatOk,
  enableMultiAgentFlag,
  mountMultiAgentStub,
  stepArtifactMessage,
  STUB_DIRECT_INTRO,
  STUB_PLAN_STEPS,
} from './fixtures/multi-agent';
import { registerUser } from './helpers/auth';

/*
 * add-multi-agent-team (task 7.2, design D4/D9/D12): team-flow e2e with
 * fully stubbed LLM hops. Assertions stop at platform behavior: the plan
 * gate, per-step TL rounds, pause actions, degrade paths and the
 * deterministic wrap-up — no WebContainer build is asserted.
 */

const WRAP_UP_HEAD = 'TL：计划执行完毕。';

/** TL settle window is 2.5s per step; keep generous margins for CI. */
const ROUND_TIMEOUT = 45_000;

async function switchToMulti(page: any) {
  await expect(page.getByTestId('agent-mode-switch')).toBeVisible({ timeout: ROUND_TIMEOUT });
  await page.getByTestId('agent-mode-multi').click();
}

async function submitPrompt(page: any, text: string) {
  const prompt = page.getByPlaceholder('How can A2 help you today?');
  await prompt.fill(text);
  await prompt.press('Enter');
}

/** Gate steps were asserted by gotoPlanGate; here just pass the gate. */
async function approvePlan(page: any) {
  const approve = page.getByTestId('agent-plan-approve');
  await expect(approve).toBeEnabled({ timeout: ROUND_TIMEOUT });
  await approve.click();
}

async function gotoPlanGate(page: any, planSteps = STUB_PLAN_STEPS) {
  await switchToMulti(page);
  await submitPrompt(page, '做一个团队介绍页面');
  await expect(page.getByTestId('agent-plan-panel')).toBeVisible({ timeout: ROUND_TIMEOUT });

  const panel = page.getByTestId('agent-plan-panel');

  for (const step of planSteps) {
    await expect(panel.getByText(step, { exact: true })).toBeVisible();
  }
}

test.describe('多智能体团队流 (D4/D9/D12)', () => {
  test('硬闸门→批准→逐步骤执行→收尾汇总', async ({ page }) => {
    await enableMultiAgentFlag(page);
    await registerUser(page);
    const counters = await mountMultiAgentStub(page, {
      chatScript: [chatOk(stepArtifactMessage(1)), chatOk(stepArtifactMessage(2)), chatOk(stepArtifactMessage(3))],
    });

    await page.goto('/');
    await switchToMulti(page);
    await submitPrompt(page, '做一个团队介绍页面');

    // PD round streams into the review gate; no auto-continue (MA-03).
    const panel = page.getByTestId('agent-plan-panel');
    await expect(panel).toBeVisible({ timeout: ROUND_TIMEOUT });

    for (const step of STUB_PLAN_STEPS) {
      await expect(panel.getByText(step, { exact: true })).toBeVisible();
    }

    // Mode switch stays locked while orchestration is active (MA-02).
    await expect(page.getByTestId('agent-mode-multi')).toBeDisabled();

    const approve = page.getByTestId('agent-plan-approve');
    await expect(approve).toBeEnabled({ timeout: ROUND_TIMEOUT });
    await approve.click();

    // TL drives one round per step; the progress panel tracks the phase.
    await expect(page.getByTestId('tl-progress-panel')).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByText('已完成步骤 1。')).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByText('已完成步骤 2。')).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByText('已完成步骤 3。')).toBeVisible({ timeout: ROUND_TIMEOUT });

    // Deterministic wrap-up (TL-05) — no model call.
    await expect(page.getByText(WRAP_UP_HEAD)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByText('共 3 步：完成 3，跳过 0，失败 0。')).toBeVisible();

    // Exactly one /api/plan hop and one /api/chat round per step.
    expect(counters.plan).toBe(1);
    expect(counters.chat).toBe(3);
    expect(counters.triage).toBe(0);
  });

  test('步骤失败→暂停→重试后完成', async ({ page }) => {
    await enableMultiAgentFlag(page);
    await registerUser(page);
    const counters = await mountMultiAgentStub(page, {
      planSteps: ['搭建页面骨架', '补充内容'],
      chatScript: [chatOk(stepArtifactMessage(1)), chatFail, chatOk(stepArtifactMessage(2))],
    });

    await page.goto('/');
    await gotoPlanGate(page, ['搭建页面骨架', '补充内容']);
    await approvePlan(page);

    // The failing round pauses the orchestration with user-only actions.
    await expect(page.getByText(/TL：步骤 2 执行失败/)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByTestId('tl-step-2')).toHaveAttribute('data-status', 'failed');
    await expect(page.getByTestId('tl-retry-step')).toBeVisible();
    await expect(page.getByTestId('tl-skip-step')).toBeVisible();
    await expect(page.getByTestId('tl-terminate')).toBeVisible();

    await page.getByTestId('tl-retry-step').click();

    await expect(page.getByText(WRAP_UP_HEAD)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByText('共 2 步：完成 2，跳过 0，失败 0。')).toBeVisible();
    expect(counters.chat).toBe(3);
  });

  test('步骤失败→暂停→跳过该步', async ({ page }) => {
    await enableMultiAgentFlag(page);
    await registerUser(page);
    await mountMultiAgentStub(page, {
      planSteps: ['搭建页面骨架', '补充内容'],
      chatScript: [chatOk(stepArtifactMessage(1)), chatFail],
    });

    await page.goto('/');
    await gotoPlanGate(page, ['搭建页面骨架', '补充内容']);
    await approvePlan(page);

    await expect(page.getByText(/TL：步骤 2 执行失败/)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await page.getByTestId('tl-skip-step').click();

    // Last step skipped → straight to the wrap-up with a 已跳过 list.
    await expect(page.getByText(WRAP_UP_HEAD)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByText('共 2 步：完成 1，跳过 1，失败 0。')).toBeVisible();
    await expect(page.getByText('○ 补充内容')).toBeVisible();
  });

  test('步骤失败→暂停→终止编排', async ({ page }) => {
    await enableMultiAgentFlag(page);
    await registerUser(page);
    const counters = await mountMultiAgentStub(page, {
      planSteps: ['搭建页面骨架', '补充内容'],
      chatScript: [chatOk(stepArtifactMessage(1)), chatFail],
    });

    await page.goto('/');
    await gotoPlanGate(page, ['搭建页面骨架', '补充内容']);
    await approvePlan(page);

    await expect(page.getByText(/TL：步骤 2 执行失败/)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await page.getByTestId('tl-terminate').click();

    await expect(page.getByText('TL：编排已终止')).toBeVisible({ timeout: ROUND_TIMEOUT });

    // Termination stops the orchestration: no further rounds launched.
    await page.waitForTimeout(1_000);
    expect(counters.chat).toBe(2);
  });

  test('PD 规划失败降级为直接生成', async ({ page }) => {
    await enableMultiAgentFlag(page);
    await registerUser(page);
    const counters = await mountMultiAgentStub(page, {
      plan: 'fail',
      chatScript: [chatOk(STUB_DIRECT_INTRO)],
    });

    await page.goto('/');
    await switchToMulti(page);
    await submitPrompt(page, '做一个团队介绍页面');

    await expect(page.getByText('PD 规划失败，已降级为直接生成')).toBeVisible({ timeout: ROUND_TIMEOUT });

    // Falls through to the original single-round path.
    await expect(page.getByText(STUB_DIRECT_INTRO)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByTestId('agent-plan-panel')).toHaveCount(0);
    await expect(page.getByTestId('tl-progress-panel')).toHaveCount(0);
    expect(counters.chat).toBe(1);
  });

  test('闸门跳过计划直接生成', async ({ page }) => {
    await enableMultiAgentFlag(page);
    await registerUser(page);
    const counters = await mountMultiAgentStub(page, {
      chatScript: [chatOk(STUB_DIRECT_INTRO)],
    });

    await page.goto('/');
    await gotoPlanGate(page);

    await page.getByTestId('agent-plan-skip').click();

    // Skip is user-only (MA-05) and falls back to the direct round.
    await expect(page.getByText(STUB_DIRECT_INTRO)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByTestId('tl-progress-panel')).toHaveCount(0);
    expect(counters.chat).toBe(1);
  });
});

test.describe('多智能体回归 (task 7.3)', () => {
  test('flag 关闭时不渲染模式开关，原有流程零变化', async ({ page }) => {
    /*
     * The premise is a flag-OFF server. A dev server started with
     * A2_ENABLE_MULTI_AGENT_MODE=true in .env bakes the flag into the client
     * bundle, so detect the injected value and skip instead of failing.
     */
    const configResp = await page.request.get('/app/a2/config.ts');
    const flagOn = /A2_ENABLE_MULTI_AGENT_MODE":\s*"true"/.test(await configResp.text());

    test.skip(flagOn, 'dev server runs with A2_ENABLE_MULTI_AGENT_MODE=true; flag-off regression needs a flag-off server');

    await registerUser(page);
    await mountLlmStub(page);

    await page.goto('/');
    await expect(page.getByPlaceholder('How can A2 help you today?')).toBeVisible({ timeout: ROUND_TIMEOUT });

    // No feature flag override: the switch and all team UI stay hidden.
    await expect(page.getByTestId('agent-mode-switch')).toHaveCount(0);
    await expect(page.getByTestId('agent-plan-panel')).toHaveCount(0);
    await expect(page.getByTestId('tl-progress-panel')).toHaveCount(0);

    // The plain generation flow works exactly as before (gen.spec shape).
    await submitPrompt(page, '做一个最简单的 hello world 页面');
    await expect(page.getByText(STUB_INTRO_TEXT)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/chat\//);
  });
});
