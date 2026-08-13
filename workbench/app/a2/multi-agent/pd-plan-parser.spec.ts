import { describe, expect, it } from 'vitest';
import { parsePdPlanOutput, parsePdPlanSteps, parsePdSelection } from './pd-plan-parser';

describe('pd-plan-parser', () => {
  it('parses both sections of a first-generation response', () => {
    const text = `
<selection>
  <templateName>bolt-vite-react</templateName>
  <title>待办清单项目</title>
</selection>
<plan>
  <step>搭好项目骨架，可以运行并预览</step>
  <step>可以添加新的待办事项</step>
  <step>可以勾选完成与删除事项</step>
  <step>刷新后数据仍然保留</step>
</plan>`;

    const result = parsePdPlanOutput(text);
    expect(result.selection).toEqual({ templateName: 'bolt-vite-react', title: '待办清单项目' });
    expect(result.steps).toHaveLength(4);
    expect(result.steps[1]).toBe('可以添加新的待办事项');
  });

  it('parses incremental output with no selection section', () => {
    const text = `
<plan>
  <step>增加登录入口</step>
  <step>未登录时隐藏待办列表</step>
</plan>`;

    const result = parsePdPlanOutput(text);
    expect(result.selection).toBeNull();
    expect(result.steps).toEqual(['增加登录入口', '未登录时隐藏待办列表']);
  });

  it('keeps a valid plan when only the selection is broken', () => {
    const text = `
<selection>
  <templateName></templateName>
</selection>
<plan>
  <step>第一步</step>
</plan>`;

    const result = parsePdPlanOutput(text);
    expect(result.selection).toBeNull();
    expect(result.steps).toEqual(['第一步']);
  });

  it('falls back to an empty title when missing', () => {
    const selection = parsePdSelection('<selection><templateName>blank</templateName></selection>');
    expect(selection).toEqual({ templateName: 'blank', title: '' });
  });

  it('returns null selection for unparseable output', () => {
    expect(parsePdSelection('抱歉，我无法完成这个请求')).toBeNull();
  });

  it('ignores empty and whitespace-only steps', () => {
    expect(parsePdPlanSteps('<step>   </step><step>有效步骤</step><step></step>')).toEqual(['有效步骤']);
  });

  it('returns no steps for garbage output', () => {
    expect(parsePdPlanSteps('没有任何结构化内容')).toEqual([]);
  });

  it('tolerates multi-line step content', () => {
    const steps = parsePdPlanSteps('<step>第一行\n第二行</step>');
    expect(steps).toEqual(['第一行\n第二行']);
  });
});
