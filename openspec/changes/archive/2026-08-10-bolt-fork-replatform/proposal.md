# Proposal: bolt.diy Fork & Replace（生成工作台换血）

## Why

现有 Application Generation 是自研的三阶段流水线（PM → Architect → Engineer），只能产出
单文件 HTML，无终端、无多文件工程、无 diff/revert，能力天花板低。bolt.diy 提供完整的
生成工作台能力（WebContainers、artifact 流式渲染、CodeMirror 编辑器、xterm 终端、
diff/revert）。经探索评估（走法 F），决定 **fork bolt.diy 使其成为产品主体**，把 A2 的
认证与持久化改造嫁接进去，而不是在 Next.js 外壳上继续自研。

## What Changes

- **新增** bolt.diy fork 作为唯一应用：保留其生成工作台全部原生能力
  （WebContainers、artifact 流、编辑器、终端、diff/revert）。
- **新增** 服务端 LLM 网关：OpenAI 兼容流式代理，服务端注入平台统一密钥接入
  阿里云百炼，默认模型 `qwen3.8-max`（已核对百炼控制台）。
  取代 FR-01 中"服务端调用 LLM + 轮询进度"的实现方式。
- **新增** 服务端聊天持久化：替换 bolt 原生的浏览器 IndexedDB 存储，
  聊天与消息经服务端 API 落库（Prisma + SQLite，全新空库）。
- **新增** 嫁接层中文页面：登录 / 注册 / 我的项目（bolt 原生界面保留英文）。
- **BREAKING** 移除多 Agent 流水线（FR-02）：`pipeline.ts`、`agents.ts` 及
  PM/Architect/Engineer 角色消息全部退役，产品叙事由"Agent 团队"改为单一工作台对话流。
- **BREAKING** 移除 Next.js 应用外壳：`src/app`、`src/components`、`src/lib`、
  `/api/generate`、`/api/generate/:sessionId/status`、`/api/projects/:id` 等路由退役，
  NextAuth 由 Remix cookie session + bcrypt 取代。
- **BREAKING** 数据模型重置：弃用现有 SQLite 库，不迁移。新模型围绕
  User / Chat（即"项目"）/ Message，取代 Project / Session / AgentMessage 三层结构。
- 隐藏 bolt 原生但本期不启用的能力：BYOK 设置页、provider 选择器、deploy 按钮。

## Scope Boundaries（第一期范围）

**In（本期做）**

- bolt fork 本地跑通（pnpm dev），WebContainers 端到端生成可用
- 登录 / 注册 / 会话保护（中文 UI）
- 聊天持久化到服务端（User / Chat / Message）
- "我的项目"列表与删除（中文 UI）
- 百炼统一接入代理（平台 key，无 BYOK）

**Non-Goals（本期明确不做）**

- 多 Agent 流水线（FR-02）——永久放弃
- 公开开关 / 公开画廊 / 文件快照分享（FR-07 及 remix 场景）——搁置，后续再议
- 生产部署（NFR-04 的 Vercel 一键部署）——本期仅本地运行
- bolt 界面汉化——保留英文，仅汉化嫁接层页面
- 模板系统（FR-06）、迭代编辑专属 API（FR-08 由 bolt 原生对话流自然覆盖，不再单列接口）

## Capabilities

### New Capabilities

- `workbench`：bolt fork 生成工作台——聊天式生成、artifact 流式落文件、
  WebContainer 实时预览、编辑器/终端、diff/revert、服务端聊天持久化、我的项目管理。
  （需求 ID 前缀 WB-）
- `llm-gateway`：平台统一 LLM 接入——OpenAI 兼容流式代理、服务端密钥注入、
  百炼上游、默认模型配置、未认证拒绝。（需求 ID 前缀 LG-）

### Modified Capabilities

- `user-auth`：认证需求保留（UA-01 ~ UA-05 的用户故事不变），但实现语境由
  Next.js + NextAuth 改为 Remix cookie session；UA-05 "My Projects" 视图并入
  `workbench` 能力，从本能力移除。
- `app-core`：**BREAKING** 大幅裁剪——FR-01 生成行为重写为工作台对话流、
  FR-02 移除、FR-03/FR-04/FR-05 由 `workbench` 能力取代并移除、
  FR-06/FR-07 移出本期、FR-08 由工作台原生能力覆盖；NFR-04 部署目标由
  Vercel 改为"本期仅本地运行"。

## Impact

- **代码**：当前仓库 `src/` 整体退役；新主体为 bolt.diy fork（Remix / React Router v7、
  pnpm、UnoCSS），所有嫁接代码收敛在 fork 内独立目录（约定 `app/a2/`）以便上游合并。
- **API**：`/api/generate`、`/api/generate/:sessionId/status`、`/api/projects/:id` 消失；
  新增 fork 内的聊天持久化 API 与 `/api/llm` OpenAI 兼容代理。
- **数据**：现有 SQLite 库弃用，不迁移；新库含 User / Chat / Message。
- **依赖**：新增 @webcontainer/api（需 COOP/COEP 跨域隔离头）、CodeMirror、xterm；
  保留 Prisma + SQLite、bcryptjs；移除 Next.js / NextAuth / Zustand / Shiki。
- **外部服务**：阿里云百炼（OpenAI 兼容端点）；WebContainers 本地开发无需域名注册。
- **遗留待办**：GitHub 克隆通道（可能需镜像）。

## User Story 对照

| 原故事 | 处置 |
|---|---|
| FR-01 Application Generation | 重写 → `workbench` WB 系列 |
| FR-02 Multi-Agent Collaboration | 移除（BREAKING） |
| FR-03 Preview / FR-04 Persistence / FR-05 Project Management | 由 `workbench` 取代 |
| FR-06 Templates / FR-07 Gallery | 移出本期（non-goal） |
| FR-08 Iterative Editing | 由 bolt 原生对话流覆盖，不再单列 |
| NFR-01 ~ NFR-03 | 大体沿用，适用对象改为 fork |
| NFR-04 Deployability | 改写：本期仅本地运行，不支持生产部署 |
| UA-01 ~ UA-04 | 保留，实现改为 Remix cookie session |
| UA-05 My Projects | 移入 `workbench` |
