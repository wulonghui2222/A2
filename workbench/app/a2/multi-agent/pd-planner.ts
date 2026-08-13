/*
 * add-multi-agent-team (task 1.2, design D2/D13/D14): PD (product manager)
 * planner prompts — first-generation (selection + plan), incremental
 * (plan only, project context injected) — plus the iteration triage prompt.
 * Plans are written in Chinese product language so users can review them;
 * technical choices stay the Engineer's job.
 */
import type { Template } from '~/types/template';

/** Cookie key persisting the user's agent mode choice (design D6 / MA-02). */
export const A2_AGENT_MODE_COOKIE_KEY = 'a2-agent-mode';

export type AgentMode = 'single' | 'multi';

/** Per-step completion state carried into incremental planning (design D14). */
export interface PdPlanStepContext {
  text: string;
  status: 'done' | 'skipped' | 'pending';
}

const PRODUCT_LANGUAGE_RULES = `
写作要求：
1. 每个步骤用产品语言描述"用户能得到什么"（功能、交互、数据保存、预览效果），
   4-6 个步骤，每步一句话。
2. 严禁出现文件名、路径、框架名、库名、技术实现细节——技术选型由工程师负责。
3. 步骤按交付顺序排列，最后一步应让项目可以运行并在预览中查看。
4. 只输出规定格式，不要输出任何解释、前言或多余文字。
`;

export function buildPdFirstGenPrompt(templates: Template[]): string {
  const templateList = [
    '<template>\n  <name>blank</name>\n  <description>空白模板，适合简单脚本和不需要完整框架的小任务</description>\n</template>',
    ...templates.map(
      (template) =>
        `<template>\n  <name>${template.name}</name>\n  <description>${template.description}</description>\n</template>`,
    ),
  ].join('\n');

  return `
你是一位资深产品经理，负责把用户的需求拆解成一份清晰的需求清单，并为项目挑选合适的起步模板。

可选的起步模板：
${templateList}

输出格式（严格按顺序输出两段，不要输出其他内容）：
<selection>
  <templateName>{选中的模板名，必须是上面列出的之一}</templateName>
  <title>{项目标题，简洁描述这个项目}</title>
</selection>
<plan>
  <step>{第 1 步}</step>
  <step>{第 2 步}</step>
  ...
</plan>
${PRODUCT_LANGUAGE_RULES}
5. 简单脚本/小任务选 blank；较完整的 Web 项目从模板列表中挑选最接近的。
`;
}

export function buildPdIncrementalPrompt(options: {
  fileTree: string[];
  currentPlan: PdPlanStepContext[];
}): string {
  const statusLabel: Record<PdPlanStepContext['status'], string> = {
    done: '已完成',
    skipped: '已跳过',
    pending: '待执行',
  };

  const planLines =
    options.currentPlan.length > 0
      ? options.currentPlan.map((step, index) => `${index + 1}. ${step.text}（${statusLabel[step.status]}）`).join('\n')
      : '（暂无历史计划）';

  return `
你是一位资深产品经理。用户的项目已经存在，现在提出了新的需求。请基于项目现状产出一份增量需求清单，描述"在现有基础上做什么"。

当前项目文件：
${options.fileTree.length > 0 ? options.fileTree.join('\n') : '（空项目）'}

当前生效的计划：
${planLines}

输出格式（只输出一段，不要输出 selection，不要输出其他内容）：
<plan>
  <step>{第 1 步}</step>
  <step>{第 2 步}</step>
  ...
</plan>
${PRODUCT_LANGUAGE_RULES}
5. 步骤必须建立在现有项目之上（修改/扩展已有能力），不要重做已经完成的步骤。
`;
}

/**
 * Iteration triage (design D13): the system prompt for the lightweight
 * non-streaming call that routes an iteration message to the direct path or
 * the incremental planning flow. Output is exactly one token: trivial | major.
 */
export function buildTriageSystemPrompt(projectSummary: string): string {
  return `
你是一个改动规模分诊器。判断用户对现有项目提出的修改请求是小改动还是大改动。

项目简况：
${projectSummary || '（暂无项目信息）'}

判断标准：
- trivial（小改动）：改样式/文案、微调单个已有功能、修一个明显的小问题，通常一两处修改即可完成。
- major（大改动）：新增功能模块、引入新的数据或页面结构、跨多个部分的改动。

只输出一个单词：trivial 或 major。不要输出任何其他内容。
`;
}
