# Design: add-unit-e2e-tests

## Context

workbench（Remix + Vite + Prisma/SQLite，pnpm）已有 vitest 依赖与 `pnpm test`
脚本（vite.config.ts 中已存在 `config.mode !== 'test'` 分支，测试模式下会跳过
`a2NodeServer()` 插件），但只有 3 个 spec 文件，无 E2E。关键服务端事实：

- 数据库路径在 `app/a2/db.server.ts` 中硬编码为 `<cwd>/prisma/a2.db`（文件型 SQLite）。
- LLM 网关为同源相对路径 `/api/llm/**`（`app/a2/config.ts` 的 `A2_LLM_BASE_URL`），
  服务端注入 `BAILIAN_API_KEY` 后转发；另有 `/api/llmcall` 供模板选择使用。
- dev 服务为 `pnpm dev`（`remix vite:dev`，http://localhost:5173）。

动机与范围见 proposal.md；需求见 specs/test-suite/spec.md。

## Goals / Non-Goals

**Goals:**

- 单元测试覆盖 TS-01 列出的三类模块，全部离线可跑。
- E2E 覆盖 TS-02 表中全部用户流，无需真实 LLM 配额、可重复运行。
- 提供 `pnpm test` / `pnpm test:e2e` / `pnpm test:all` 三个入口，Windows
  PowerShell 与 Unix 均可运行。

**Non-Goals:**

- 不引入覆盖率阈值门禁、不接 CI 流水线、不做视觉回归与性能测试。
- 不为可测性大规模重构业务代码；只允许零行为变更的最小注入点调整（如确有
  必要，在 tasks 中单列）。

## Decisions

### D1: 单元测试沿用 Vitest，零配置增量扩展

复用既有 `vitest` 依赖与 `*.spec.ts` 同目录约定，不新增配置文件。服务端
持久化测试不导入 `db.server.ts`（其路径硬编码），而是在测试内直接构造
`new PrismaClient({ datasources: { db: { url: 'file:<临时库>' } } })`，临时库
由测试 setup 用 `prisma db push` 基于现有 schema 创建到 OS 临时目录，suite
结束后删除。

备选：为 `db.server.ts` 增加环境变量覆盖——需要改业务代码且影响运行时行为，否决。

### D2: E2E 选 Playwright，`webServer` 托管服务生命周期

新增 `@playwright/test`，仅 Chromium 一个浏览器。`playwright.config.ts` 使用
`webServer` 启动 `pnpm dev` 并等待 5173 就绪，`reuseExistingServer: !process.env.CI`：
本地开发者已开着 dev server 时直接复用，避免端口冲突；`baseURL` 可由
`E2E_BASE_URL` 覆盖。测试文件放 `tests/e2e/*.spec.ts`，vitest 通过默认
include 规则（`app/**` 内的 `*.spec.ts`）与 e2e 目录天然隔离——需在配置里
确认 vitest 只扫 `app/`，必要时显式设置 include。

备选：Cypress——网络拦截与多上下文隔离能力弱于 Playwright，且依赖体积大，否决。

### D3: LLM 打桩用 Playwright 网络拦截，零业务代码改动

生成流测试用 `page.route('**/api/llm/**')` 与 `**/api/llmcall` 拦截，返回预先
录制的 OpenAI 兼容 SSE 流（内含 bolt 工件动作，如 `<boltArtifact>` 文件写入
标签），使 message-parser/action 管线在不消耗真实配额的情况下产生确定输出。
打桩脚本集中放 `tests/e2e/fixtures/llm-stream.ts`，单一事实源。

备选：服务端 mock 开关（需改网关代码，引入非测试路径分支）；真实 key 联网调用
（不确定、耗配额）——均否决。

### D4: 数据隔离用"唯一账号 + 自清理"而非独立数据库实例

由于 `db.server.ts` 硬编码 `prisma/a2.db`，E2E 运行在开发者本地库上；每个
测试通过 helper 注册带随机后缀的唯一邮箱账号（`e2e-<ts>-<rand>@test.local`），
测试只读写自己创建的项目记录，互不依赖顺序。suite 结束后通过 API 尽力删除
本次创建的账号数据（best-effort，失败不影响结果）。

备选：改 cwd 起独立数据库的服务器实例——pre-start 与 git 读取对 cwd 敏感，
复杂度高且脆弱，否决。

### D5: 生成流断言止于平台自身行为

E2E 生成场景断言：流式消息出现、助手回复包含打桩内容、文件树/聊天持久化
生效。不断言 WebContainer 内构建成功或预览 iframe 渲染完成（环境依赖强、
易 flaky），符合 TS-03。

### D6: 脚本跨平台

`test:e2e` = `playwright test`（webServer 自管服务）；`test:all` = 用 node
脚本顺序执行 vitest 与 playwright（避免 shell `&&` 差异）。不使用 bash-only
语法，兼容 Windows PowerShell。

## Risks / Trade-offs

- [Playwright 浏览器下载体积大] → 只在 devDependencies；README/tasks 中说明
  首次需 `pnpm exec playwright install chromium`。
- [复用开发者 dev server 可能带上其未保存改动/脏数据] → 唯一账号隔离 +
  断言只针对本测试创建的数据；CI 场景由 `reuseExistingServer: false` 兜底。
- [SSE 打桩与真实网关格式漂移] → fixture 按 OpenAI 兼容协议构造，若网关改造
  导致解析失败，测试失败即暴露问题（这正是回归测试的目的）。
- [a2.db 测试数据累积] → teardown best-effort 清理 + 唯一前缀便于人工清理。
- [既有 3 个 spec 文件当前状态未知] → 实施第一步先跑基线，失败则先修复或
  标记后再扩展。

## Migration Plan

纯增量变更：新增测试文件、Playwright 配置与 devDependencies，新增 npm scripts。
回滚 = 删除新增文件与脚本条目，不影响任何业务行为。
