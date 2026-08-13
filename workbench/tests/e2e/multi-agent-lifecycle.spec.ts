import { expect, test, type Page } from '@playwright/test';
import {
  chatOk,
  enableMultiAgentFlag,
  mountMultiAgentStub,
  stepArtifactMessage,
  STUB_DIRECT_INTRO,
  type MultiAgentCounters,
  type MultiAgentStubOptions,
} from './fixtures/multi-agent';
import { registerUser } from './helpers/auth';

/*
 * add-multi-agent-team (task 7.4, design D13/D14): planning spans the full
 * project lifecycle. Iteration messages in multi mode go through triage:
 * trivial → direct path, major → incremental PD planning + the same hard
 * gate + TL steps. Triage failure degrades to direct; single mode never
 * triages.
 */

const FIRST_GEN_STEPS = ['搭建页面骨架', '补充内容'];
const ROUND_TIMEOUT = 45_000;

async function submitPrompt(page: Page, text: string) {
  const prompt = page.getByPlaceholder('How can A2 help you today?');
  await prompt.fill(text);
  await prompt.press('Enter');
}

/** Multi-mode first generation through the gate, ending at the wrap-up. */
async function setupWithFirstGen(page: Page, options: MultiAgentStubOptions): Promise<MultiAgentCounters> {
  await enableMultiAgentFlag(page);
  await registerUser(page);
  const counters = await mountMultiAgentStub(page, options);

  await page.goto('/');
  await expect(page.getByTestId('agent-mode-multi')).toBeVisible({ timeout: ROUND_TIMEOUT });
  await page.getByTestId('agent-mode-multi').click();
  await submitPrompt(page, '做一个团队介绍页面');

  const panel = page.getByTestId('agent-plan-panel');
  await expect(panel).toBeVisible({ timeout: ROUND_TIMEOUT });

  const approve = page.getByTestId('agent-plan-approve');
  await expect(approve).toBeEnabled({ timeout: ROUND_TIMEOUT });
  await approve.click();

  await expect(page.getByText('TL：计划执行完毕。')).toBeVisible({ timeout: ROUND_TIMEOUT });

  return counters;
}

test.describe('迭代生命周期 (D13/D14)', () => {
  test('大改动迭代：分诊→增量规划→闸门→逐步执行', async ({ page }) => {
    const counters = await setupWithFirstGen(page, {
      planSteps: FIRST_GEN_STEPS,
      chatScript: [
        chatOk(stepArtifactMessage(1)),
        chatOk(stepArtifactMessage(2)),
        chatOk(stepArtifactMessage(3)),
        chatOk(stepArtifactMessage(4)),
      ],
      triage: 'major',
    });

    await submitPrompt(page, '把整个页面重构成多栏目布局并新增团队展示模块');

    // Triage outcome briefly visible, then auto-proceeds into planning.
    await expect(page.getByTestId('triage-decision')).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByText('判断为大改动，将先进入规划')).toBeVisible();

    // Incremental plan reaches the same hard gate.
    await expect(page.getByTestId('agent-plan-panel')).toBeVisible({ timeout: ROUND_TIMEOUT });

    const planBody = counters.planRequests[1];
    expect(planBody?.mode).toBe('incremental');
    expect(Array.isArray(planBody?.fileTree)).toBe(true);

    const approve = page.getByTestId('agent-plan-approve');
    await expect(approve).toBeEnabled({ timeout: ROUND_TIMEOUT });
    await approve.click();

    // Second orchestration finishes with its own wrap-up.
    await expect(page.getByText('TL：计划执行完毕。')).toHaveCount(2, { timeout: ROUND_TIMEOUT });
    expect(counters.plan).toBe(2);
    expect(counters.chat).toBe(4);
  });

  test('小改动迭代直通 + 一键推翻转规划', async ({ page }) => {
    const counters = await setupWithFirstGen(page, {
      planSteps: FIRST_GEN_STEPS,
      chatScript: [
        chatOk(stepArtifactMessage(1)),
        chatOk(stepArtifactMessage(2)),
        chatOk(STUB_DIRECT_INTRO),
        chatOk(stepArtifactMessage(3)),
        chatOk(stepArtifactMessage(4)),
      ],
      triage: 'trivial',
    });

    // Iteration 1: trivial → decision card auto-proceeds into direct gen.
    await submitPrompt(page, '把标题颜色改成蓝色');
    await expect(page.getByText('判断为小改动，将直接生成')).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByText(STUB_DIRECT_INTRO)).toBeVisible({ timeout: ROUND_TIMEOUT });
    expect(counters.plan).toBe(1);

    // Iteration 2: same verdict, overridden back into planning (D13).
    await submitPrompt(page, '再把标题颜色改成红色');
    await expect(page.getByTestId('triage-decision')).toBeVisible({ timeout: ROUND_TIMEOUT });
    await page.getByTestId('triage-override').click();

    await expect(page.getByTestId('agent-plan-panel')).toBeVisible({ timeout: ROUND_TIMEOUT });
    expect(counters.plan).toBe(2);
    expect(counters.planRequests[1]?.mode).toBe('incremental');
  });

  test('分诊失败降级直通', async ({ page }) => {
    const counters = await setupWithFirstGen(page, {
      planSteps: FIRST_GEN_STEPS,
      chatScript: [chatOk(stepArtifactMessage(1)), chatOk(stepArtifactMessage(2)), chatOk(STUB_DIRECT_INTRO)],
      triage: 'fail',
    });

    await submitPrompt(page, '把标题颜色改成蓝色');

    // Failure never blocks: toast + direct round.
    await expect(page.getByText('分诊失败，已按小改动直接生成')).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByText(STUB_DIRECT_INTRO)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByTestId('agent-plan-panel')).toHaveCount(0);
    expect(counters.plan).toBe(1);
    expect(counters.triage).toBe(1);
  });

  test('单智能体模式迭代无分诊', async ({ page }) => {
    await enableMultiAgentFlag(page);
    await registerUser(page);
    const counters = await mountMultiAgentStub(page, {
      chatScript: [chatOk(stepArtifactMessage(1)), chatOk(STUB_DIRECT_INTRO)],
    });

    // Flag on but the pill stays on 单智能体: no planning, no triage.
    await page.goto('/');
    await expect(page.getByTestId('agent-mode-single')).toBeVisible();
    await submitPrompt(page, '做一个团队介绍页面');
    await expect(page.getByText('已完成步骤 1。')).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByTestId('agent-plan-panel')).toHaveCount(0);

    await submitPrompt(page, '把标题颜色改成蓝色');
    await expect(page.getByText(STUB_DIRECT_INTRO)).toBeVisible({ timeout: ROUND_TIMEOUT });
    await expect(page.getByTestId('triage-decision')).toHaveCount(0);
    expect(counters.triage).toBe(0);
    expect(counters.plan).toBe(0);
  });
});
