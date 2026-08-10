# Design — a2-bolt-data-sync

建立在 `bolt-rewrite` 的 seam 协议（D3）与 workbench 路由之上；本 change 只做
**身份、入口、历史** 三条数据打通，不改动隔离契约（D2）与 token 信任模型
（WE-02）。See proposal.md for motivation.

## Context

- A2 已有 NextAuth JWT 会话（`auth()` → `session.user.{id, username, displayName}`），
  `/workbench/[projectId]/page.tsx` 服务端组件已持有 user 与 project。
- bolt fork 的 seam 层在 `workbench/app/lib/a2-seam/index.ts`：`a2SeamState`
  atom 持 `{ connected, token, projectId }`；握手由 A2 侧 `WorkbenchClient.tsx`
  在每次 iframe `onLoad` 触发（per-load handshake，已验证必需）。
- bolt 的聊天存储是浏览器 IndexedDB（`workbench/app/lib/persistence/db.ts` 的
  `openDatabase` / `setMessages`），记录以 chat id 为键；`storeMessageHistory`
  在采样器里写入并 takeSnapshot。`Project.workbenchChatId`（bolt-rewrite 验证期
  已加）已把项目与某个 bolt chat 绑定。
- `/projects/[id]/page.tsx` 当前对 owner 渲染只读详情（预览/源码/会话历史）+
  "打开工作台" 按钮；`SessionsPane.tsx` 的 `ROLE_META` 含 pm/architect/engineer/
  system/user，无 assistant。

## Goals / Non-Goals

**Goals:**
- 让 bolt 知道"当前 A2 用户是谁"（显示 + 数据隔离），不引入服务端聊天存储。
- 让 owner 点项目卡 → 自动进 workbench，无需手动跳转。
- 把 bolt 聊天历史只读镜像到 A2 `Session`/`AgentMessage`，详情页"会话历史"复活。

**Non-Goals:**
- 不把 A2 镜像做成实时编辑面（IndexedDB 仍是唯一 live chat）。
- 不做跨设备 live resume（仍靠 IndexedDB + workbenchChatId）。
- 不改 My-Projects 卡片链接目标（保持 `/projects/:id`，由详情页重定向）。
- 不代理 bolt 的 LLM 流量（沿用 bolt-rewrite R3 推迟）。

## Decisions

### D1. 身份随 handshake 下发，不单开消息

`handshake` 信封扩展为 `{ token, project: { id, prompt, isNew, title }, user: { id, displayName } }`。
A2 侧 `WorkbenchClient` 从服务端 props 取 `user`/`project.title` 一并下发；bolt 侧
`a2SeamState` 增加 `a2UserId` / `displayName`。
**理由**：身份必须在聊天创建之前就位（否则新 chat 无法打 scope 标）；per-load
handshake 已保证每次 iframe 加载都重发，复用零额外握手。
**替代**：单独发 `identity` 消息——会与 chat 创建竞态，且多一条消息循环。否决。

### D2. 聊天按 a2UserId 打标 + 列表过滤（非每用户一库）

bolt 的 IndexedDB chat 记录增加可选 `a2UserId` 字段；`storeMessageHistory` 创建
新 chat 时从 `a2SeamState.a2UserId` 取值打标。聊天历史侧边栏的 `getAll` 查询按
当前 `a2UserId` 过滤。
**理由**：避免"每用户一个 DB"的库膨胀；查询路径集中，改动最小。
**替代**：每 a2UserId 一个独立 DB（`bolt-<a2UserId>`）——隔离最干净但 N 个库、
迁移复杂。否决。
**兼容**：存量 chat 无 `a2UserId` → 归入 `anonymous-default` scope，不向任何
已登录用户展示（防止串库）；只有本 change 上线后新建的 chat 才带 scope。

### D3. 聊天历史镜像：replace 策略，一项目一 Session

`storeMessageHistory` 在 settle 队列后（已有 `actionsSettled`）额外向 parent 发
`chat-history`（载荷：`{ urlId?, messages: [{ role, content, timestamp }] }`，过滤
掉 `no-store` 注解）。A2 侧 `WorkbenchClient` 复用 artifact 处理范式：re-issue
token → `POST /api/workbench/chat-history` → 服务端在一个事务里
`Session.upsert({ where: { projectId }, ... })` + `AgentMessage.deleteMany({ sessionId })`
+ `AgentMessage.createMany(...)`，回 `chat-history-ack`。
**理由**：replace（删后重建）最简单、无 partial 态；镜像本就只读可覆盖。
`AgentMessage.id` 直接用 bolt message id（字符串，schema 是 `String @id`），便于
幂等重放。
**替代**：按 message id 逐条 upsert——要去重键、易留残骸。否决。
**时机**：save 时必发；此外每个 assistant 回合结束（debounce ~1s）发增量，保证
详情页历史跟得上迭代。

### D4. Owner 重定向：服务端 `redirect()`，公开访客穿透

`/projects/[id]/page.tsx` 在 owner 判定后、`viewCount` 自增前调用
`redirect('/workbench/' + id)`（Next.js server redirect）。非 owner 且非公开 →
`notFound()`（不变）；公开访客穿透到既有只读渲染。
**理由**：服务端重定向最稳，不依赖客户端 `router`；COEP/COOP 头由 `/workbench`
全文档加载时生效（per-load handshake 记忆：SPA 导航不会换 browsing context）。
**冗余清理**：详情页原本给 owner 的"打开工作台"按钮与跳转横幅现在对 owner 不可
见（被重定向），删除以免死代码；公开访客本就看不到它们。

### D5. Owner 管理动作重分布

owner 被重定向后不再落到详情页，管理入口重分布：
- **删除**：My-Projects 卡片悬浮菜单已有（`ConfirmPopover`）→ 保留；workbench
  头部补一个删除入口（复用 `DeleteProjectButton`）。
- **公开开关**：从详情页移到 workbench 头部（owner-only）。
- **重命名**：在 My-Projects 卡片悬浮菜单加"重命名"项（调 `PATCH /api/projects/:id`）；
  workbench 头部标题暂不做内联编辑（可后置）。
**理由**：把 owner 真正所在之处（My-Projects / workbench）补齐管理能力，不丢
原 FR-05 的 rename/delete API 契约。

### D6. SessionsPane 渲染 bolt 轮次

`ROLE_META` 增加 `assistant: { label: "助手", avatar: "🤖", color: ... }`；
`user` 沿用。`/projects/[id]/page.tsx` 的 flatten 逻辑不变（已按 session 取
AgentMessage），镜像写入后自动流入。`agentRole` 列是 `String`，无需 schema 迁移。
旧管线项目的 pm/architect/engineer 记录仍在，标签保留。

## Risks / Trade-offs

- **R1 聊天历史载荷过大**：长对话的 `messages[]` 可能超限。缓解：API 对单次
  同步设消息数/字节上限（如 ≤ 200 条、≤ 2MB），超出只取最近 N 条并记 metadata。
- **R2 镜像与 live 聊天漂移**：镜像只读，live 在 IndexedDB。接受；save + 回合
 结束都发增量，详情页历史最多落后一个回合。
- **R3 a2UserId scope 串库**：存量 chat 归 anonymous-default，不向任何登录用户
  展示，防止第一个登录用户"继承"他人聊天。新 chat 才带 scope。
- **R4 owner 失去只读详情深链**：被重定向后看不到只读预览/历史。缓解：保留
  `?readonly=1` 旁路（见 Open Questions）；owner 一般不需要（live workbench 在手）。
- **R5 assistant 内容含 `<boltArtifact>` 标记**：会话历史里原始渲染会很长。
  缓解：首版直接 `<pre>` 渲染（已有）；后续可剥离 artifact 标记或只显示摘要。

## Migration Plan

1. **先身份与隔离**：seam handshake 扩 user/project.title + bolt a2SeamState +
   IndexedDB chat 打 a2UserId 标 + 列表过滤。可独立验证（两用户不串库）。
2. **再历史镜像**：`chat-history` 消息 + `POST /api/workbench/chat-history` +
   SessionsPane assistant 角色。可独立验证（save 后详情页历史有内容）。
3. **最后入口重定向与管理重分布**：`/projects/[id]` owner redirect + 详情页
   死代码清理 + workbench 头部 delete/public-toggle + My-Projects rename。
4. 无 DB 迁移（复用 Session/AgentMessage；AgentMessage.agentRole 是 String）。
5. 回归：`tests/workbench-api-test.mjs` 扩 chat-history 用例；`public-toggle-gallery-
   test.mjs` 保持绿（公开访客路径未变）。

## Open Questions

- owner 只读详情旁路 `?readonly=1` 是否首版就要？倾向：首版不做，若用户反馈
  再加（重定向是主路径）。
- assistant 消息在 SessionsPane 是否剥离 `<boltArtifact>` 标记？倾向：首版原样
  渲染，后续做摘要/清洗（不影响数据契约）。
- chat-history 增量同步的 debounce 窗口（~1s）是否够稳？实施时实测调。
