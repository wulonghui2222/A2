import { describe, expect, it } from 'vitest';
import { buildStepInstruction } from './buildStepInstruction';

const plan = [{ text: '搭好项目骨架' }, { text: '可以添加待办事项' }, { text: '刷新后数据保留' }];

describe('buildStepInstruction', () => {
  it('marks completed, current and pending steps', () => {
    const instruction = buildStepInstruction(plan, 1);
    expect(instruction).toContain('已批准的计划（共 3 步）：');
    expect(instruction).toContain('1. 搭好项目骨架（✓ 已完成）');
    expect(instruction).toContain('2. 可以添加待办事项（▶ 当前）');
    expect(instruction).toContain('3. 刷新后数据保留（待执行）');
    expect(instruction).toContain('当前执行步骤 2：可以添加待办事项');
  });

  it('keeps the scope constraint line', () => {
    const instruction = buildStepInstruction(plan, 0);
    expect(instruction).toContain('仅完成当前步骤；不要提前实现后续步骤；基于当前项目已有代码继续。');
  });

  it('marks every earlier step completed on the last step', () => {
    const instruction = buildStepInstruction(plan, 2);
    expect(instruction).toContain('1. 搭好项目骨架（✓ 已完成）');
    expect(instruction).toContain('2. 可以添加待办事项（✓ 已完成）');
    expect(instruction).toContain('3. 刷新后数据保留（▶ 当前）');
    expect(instruction).toContain('当前执行步骤 3：刷新后数据保留');
  });
});
