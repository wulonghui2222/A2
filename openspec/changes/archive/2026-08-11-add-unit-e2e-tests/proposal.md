# Proposal: add-unit-e2e-tests

## Why

workbench 目前仅有 3 个零散的 vitest 规格文件（`Markdown.spec.ts`、`message-parser.spec.ts`、`diff.spec.ts`），
核心链路（认证、项目 CRUD、A2 持久化、LLM 网关、工作台聊天流）没有任何回归保障，
也没有任何 E2E 测试。每次改动（如近期 Header、侧边栏本地化、LLM 网关修复）都只能靠手工
在浏览器里点验，回归风险高且无法在 CI 中把关。本变更为 workbench 整体补齐单元测试
与 E2E 测试体系。

## What Changes

- 新增 `test-suite` 能力：定义 workbench 的测试金字塔要求（哪些模块必须有单元测试、
  哪些用户流必须有 E2E 覆盖）、确定性与隔离要求（LLM/WebContainer 必须可 mock）、
  以及本地一键运行入口。
- 单元测试（Vitest，复用现有 `pnpm test`）：
  - 补齐 `app/utils` 纯函数模块测试（diff、shell、stripIndent、promises、debounce、
    buffer、classNames、folderImport、projectCommands、selectStarterTemplate 等）
  - 补齐 `app/lib` 核心逻辑测试（crypto、fetch、runtime/action 解析、persistence 相关纯逻辑）
  - 新增 `app/a2` 持久化与服务端逻辑测试（db、session.server、plaza 可见性规则等），
    使用内存/临时 SQLite
- E2E 测试（新增 Playwright，`pnpm test:e2e`）：
  - 认证流：注册 → 登录 → 登出、未登录访问受保护页跳转登录
  - 项目流：我的项目列表、项目详情/聊天页可打开
  - 项目广场流：列表展示、公开/私有可见性切换
  - 生成流：聊天提交 prompt → 流式响应（LLM 网关打桩为固定脚本响应）
- 新增 npm scripts：`test:e2e`、`test:all`（单元 + E2E），以及 Playwright 配置文件。
- 范围边界 / 非目标：
  - 不涉及 `/src`（废弃目录，不维护、不测试）
  - 不做视觉回归（screenshot diff）、性能/负载测试、真实第三方 LLM 的联网测试
  - 不在本变更中搭建 CI 流水线（仅提供可被 CI 调用的本地脚本）
  - 不追求固定覆盖率阈值数字，以"关键模块 + 关键用户流全覆盖"为准

## Capabilities

### New Capabilities

- `test-suite`: workbench 的测试基础设施与覆盖要求——单元测试范围、E2E 用户流范围、
  测试隔离与确定性、运行入口。该能力通过测试验证既有能力的行为，引用
  FR-01（app-core）及 user-auth / project-plaza / workbench / llm-gateway 中的
  相关用户故事场景作为 E2E 覆盖依据。

### Modified Capabilities

- 无（本变更不改变任何既有功能的规格行为，仅新增测试能力）

## Impact

- 代码：`workbench/` 内新增测试文件（`*.spec.ts` / `tests/e2e/**`），不修改业务代码；
  若个别代码因不可测需要最小重构（如注入点），在 tasks 中单独列出并保持行为不变。
- 依赖：新增 devDependencies——`@playwright/test`（E2E），如需要再补
  `@testing-library/*`（组件测试，按需）。
- 脚本：`workbench/package.json` 新增 `test:e2e` / `test:all`。
- 系统：E2E 需要本地起 workbench dev server（http://localhost:5173）与文件型 SQLite；
  LLM 网关在 E2E 中通过打桩/mock 提供确定性响应，不消耗真实模型配额。
