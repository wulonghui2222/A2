/*
 * add-multi-agent-team (task 4.2, design D10): pure builder for the per-step
 * hidden user instruction. Kept a pure function so it can be unit-tested and
 * reused by retry/skip flows.
 */

export interface TlPlanStep {
  text: string;
}

export function buildStepInstruction(plan: TlPlanStep[], currentIndex: number): string {
  const lines = plan.map((step, index) => {
    let mark: string;

    if (index < currentIndex) {
      mark = '✓ 已完成';
    } else if (index === currentIndex) {
      mark = '▶ 当前';
    } else {
      mark = '待执行';
    }

    return `${index + 1}. ${step.text}（${mark}）`;
  });

  return [
    `已批准的计划（共 ${plan.length} 步）：`,
    ...lines,
    '',
    `当前执行步骤 ${currentIndex + 1}：${plan[currentIndex]?.text ?? ''}`,
    '要求：仅完成当前步骤；不要提前实现后续步骤；基于当前项目已有代码继续。',
  ].join('\n');
}
