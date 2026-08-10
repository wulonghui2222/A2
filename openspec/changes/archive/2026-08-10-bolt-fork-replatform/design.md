# Design: bolt.diy Fork & Replace

## Context

现状与约束（动机见 proposal.md - Why）：

- 现主体为 Next.js 15 应用（`src/`），认证 NextAuth Credentials + bcrypt，
  持久化 Prisma + SQLite（User / Project / Session / AgentMessage）。
- bolt.diy 为 Remix / React Router v7 + pnpm + UnoCSS，聊天持久化在浏览器 IndexedDB，
  LLM 调用为 BYOK（浏览器直连 provider），无认证、无服务端数据库。
- 约束：本期仅本地运行；术语规范见 openspec/config.yaml（代码与数据模型用
  Project / project，中文 UI 用"项目"）。

## Goals / Non-Goals

**Goals:**

- 给出 fork 仓库策略、嫁接层代码组织、持久化替换、认证移植、LLM 网关的
  可执行技术方案，实施者无需再做架构级决策。
- 把上游合并冲突面压到最小。

**Non-Goals:**

- 不设计公开分享 / 文件快照、生产部署、bolt 界面汉化（见 proposal Non-Goals）。
- 不逐行规定实现；bolt 内部模块细节以开工 spike 的实测为准。

## Decisions

### D1 仓库策略：独立 fork 仓库，本仓库冻结为参考

fork 落到新仓库（实际 `c:\code\A2-new\a2-workbench`，嵌套于旧仓库目录但为独立 git 仓库且已被其 `.gitignore` 排除），`upstream` 指向 bolt.diy 官方仓库，
本仓库（A2-new）代码冻结、仅作规格之家与旧实现参考。

- 备选 A：把 fork 内容并入本仓库、删除 `src/`。否决：污染 git 历史，
  上游 merge 与 OpenSpec 工件混杂，且回滚困难。
- 备选 B：fork 作为本仓库子目录（vendor）。否决：上游同步路径别扭，
  双 package.json 共存混乱。
- 克隆通道：优先官方 GitHub；不可达时用镜像（如 gitee 镜像）克隆后把
  `upstream` remote 改回官方地址。
- 分支模型：`main` 跟上游，定制在 `a2` 分支，定期 merge `upstream/main`（不 rebase）。

### D2 嫁接层收敛：`app/a2/` 命名空间 + 特性开关

所有定制代码（认证、持久化适配、中文页面、LLM 代理客户端配置）放入 fork 的
`app/a2/` 目录；对 bolt 原生文件的改动仅限**开关式**修改（常量 / 配置 / 条件渲染），
不做结构性重写。

- 备选：直接在 bolt 文件里改写。否决：每次上游合并都冲突，不可持续。

### D3 认证：Remix cookie session + bcrypt，不引入 Auth.js

登录 / 注册实现为 Remix route action：bcrypt 校验后签发 httpOnly cookie
（内含签名 JWT，保持 UA-02 的"JWT session in httpOnly cookie"语义）；
路由保护在 loader 层做重定向（等价 UA-04 middleware 行为）。

- 备选：Auth.js Remix adapter。否决：对 React Router 支持弱、抽象重，
  而需求只有 username/password，手写 session 更薄且贴 bolt 技术栈。
- 中文文案沿用现有规格："用户名已被注册"、"用户名或密码错误"等。

### D4 持久化：服务端 Prisma 存储 + bolt persistence 适配层

数据模型（全新 SQLite 库，术语遵循 Project 规范）：

```
User    { id, username, password(bcrypt), displayName?, createdAt }
Project { id, title, userId, createdAt, updatedAt }   // 对应 bolt 的一个 chat
Message { id, projectId, role, payload(JSON), createdAt }  // bolt 消息原样存 JSON
```

替换点：bolt 的 IndexedDB persistence 模块是独立模块，实现一个同接口的
服务端适配器（REST/JSON 调用 fork 内 resource routes），客户端 nanostores
数据流不改。Project 标题取 chat description（bolt 已有的自动命名能力）。

- 备选：保留 IndexedDB 仅做服务端备份。否决：双写一致性复杂，且换浏览器
  即丢数据，不符合"数据持久化"需求。
- Message 用 JSON 整体存 bolt 消息体，避免为 artifact 内部结构建关系表——
  bolt 消息格式随上游演进，JSON 免疫 schema 漂移。

### D5 LLM 网关：`/api/llm` OpenAI 兼容代理

fork 内新增 resource route `POST /api/llm`：接收 OpenAI chat completions
格式请求 → 服务端注入 `BAILIAN_API_KEY` → 透传至百炼 OpenAI 兼容端点
（dashscope compatible-mode）→ SSE 流式回传。未认证请求返回 401。

客户端侧：bolt 的 "OpenAI Compatible" provider 固定指向 `/api/llm`，
隐藏 API key 输入与 provider 选择；默认模型由环境变量
`A2_DEFAULT_MODEL` 注入，初值 `qwen3.8-max`（已核对百炼控制台，2026-08-10）。

- 备选甲：浏览器直连百炼（零服务端代码）。否决：平台 key 暴露前端。
- 备选乙：写 bolt 自定义 provider 模块。否决：改上游 provider 注册表，
  合并冲突大；复用现成 OpenAI-compatible provider 只改配置。

### D6 bolt 原生能力隐藏：配置级开关

BYOK 设置入口、provider 选择器、deploy 按钮等通过常量开关 / 条件渲染隐藏，
不删代码，保证上游合并平滑。

### D7 WebContainers 运行环境

Remix server 配置 COOP/COEP 跨域隔离头（本地 dev 即需）；
`@webcontainer/api` 本地开发无需域名注册。

### D8 数据库初始化

fork 内新增 `prisma/`（schema 见 D4），SQLite 文件置于 gitignore 路径；
dev setup 走 `prisma db push`。旧 A2-new 的库文件不迁移、不复制。

## Risks / Trade-offs

- [bolt persistence 内部结构与预期不符，适配器接口对不齐] → 第一个任务设为
  spike：裸 fork 跑通 + 走通一次生成，实测 persistence / nanostores 数据流
  后再冻结适配器接口；本设计 D4 允许据此微调（不改需求）。
- [上游演进快，合并冲突累积] → D2 命名空间收敛 + D6 开关式改动 + 每两周
  固定 merge 一次 upstream。
- [百炼 model ID 变更或下线] → model 由环境变量 `A2_DEFAULT_MODEL` 配置，
  当前值 `qwen3.8-max` 已于百炼控制台核实，后续变更改 env 即可，不阻塞架构。
- [WebContainers 需联网加载运行时，且浏览器兼容性有限] → 需求文档注明
  本地演示环境要求（Chrome/Edge 最新版）；无离线承诺。
- [Message 全 JSON 存储牺牲了查询能力] → 第一期无跨消息检索需求；
  未来需要时再拆列。
- [GitHub 直连不稳定影响 clone 与 upstream 同步] → 镜像克隆兜底；
  同步失败时允许阶段性停滞，不影响本地开发。

## Migration Plan

1. **Spike**：克隆 fork、`pnpm dev` 跑通、配置 COOP/COEP、用 BYOK 走通
   一次端到端生成（验证 WebContainers）。
2. **网关**：实现 `/api/llm` 代理 + 百炼 key，客户端 provider 切换指向，
   验证流式生成。
3. **持久化**：建 Prisma schema 与 resource routes，实现 persistence 适配器，
   验证聊天跨刷新保留。
4. **认证**：login/register/保护路由（中文 UI），工作台入口要求登录。
5. **我的项目**：列表 + 删除（中文 UI）。
6. **隐藏项**：BYOK/provider/deploy 开关收敛。
7. **切换**：验收通过后 A2-new 标记 archived；回滚策略 = A2-new 原样保留，
   随时可回到旧实现。

## Open Questions

- "我的项目"卡片缩略图：第一期用占位图还是尝试 WebContainer 截图？
  倾向占位图，实施时定。
- bolt 上游当前默认模型列表是否需要清理到只剩平台模型——spike 后定。
