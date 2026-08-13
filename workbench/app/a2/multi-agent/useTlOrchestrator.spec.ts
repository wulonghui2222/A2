import { describe, expect, it } from 'vitest';
import { buildWrapUpSummary } from './useTlOrchestrator';

describe('buildWrapUpSummary', () => {
  it('lists done, skipped and failed steps in Chinese copy', () => {
    const summary = buildWrapUpSummary([
      { text: '搭好项目骨架', status: 'done' },
      { text: '可以添加待办事项', status: 'done' },
      { text: '支持暗色主题', status: 'skipped' },
      { text: '数据导出', status: 'failed' },
    ]);

    expect(summary).toContain('共 4 步：完成 2，跳过 1，失败 1。');
    expect(summary).toContain('✓ 搭好项目骨架');
    expect(summary).toContain('○ 支持暗色主题');
    expect(summary).toContain('✗ 数据导出');
  });

  it('omits empty sections', () => {
    const summary = buildWrapUpSummary([{ text: '搭好项目骨架', status: 'done' }]);

    expect(summary).toContain('共 1 步：完成 1，跳过 0，失败 0。');
    expect(summary).not.toContain('已跳过');
    expect(summary).not.toContain('未完成');
  });
});
