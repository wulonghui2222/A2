# Design — bolt-rewrite (Shape B)

Grounded in the spike results (`doc/spike-bolt-embed.md`, 3/3 pass) and the explore
decisions: Shape B topology; multi-agent orchestration abandoned.

## Architecture Overview

```
┌──────────────────────────── 用户浏览器 ────────────────────────────┐
│                                                                    │
│  A2 (Next.js, WORKBENCH host)                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 门户: / /gallery /my-projects /projects/:id /login           │  │
│  │                                                              │  │
│  │ /workbench/:projectId  ← COEP: require-corp + COOP（仅此路由） │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ iframe src=$WORKBENCH_ORIGIN (bolt fork)               │  │  │
│  │  │   allow="cross-origin-isolated"                        │  │  │
│  │  │   chat ⇄ artifacts ⇄ WebContainer 实时预览              │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │        ▲ postMessage（origin + 一次性 token 双向校验）         │  │
│  └────────┼─────────────────────────────────────────────────────┘  │
│           │                                                        │
└───────────┼────────────────────────────────────────────────────────┘
            │ HTTPS (A2 API)
   ┌────────▼─────────┐        ┌─────────────────────┐
   │ A2 server        │        │ bolt fork           │
   │ token 签发/核销   │        │ Remix + WebContainer │
   │ artifact 落库     │        │ COEP/COOP/CORP 头    │
   │ SQLite (Prisma)  │        │ LLM: 浏览器端直连     │
   └──────────────────┘        └─────────────────────┘
```

生成过程完全发生在用户浏览器内的 bolt + WebContainer 中；A2 服务端只做
**身份、所有权、持久化**。

## Decisions

### D1. 部署拓扑：双应用 + `WORKBENCH_ORIGIN` 环境变量

bolt fork 保留在仓库内 `workbench/`（由 `spike-bolt/` 重命名），独立 dev server
（`pnpm dev`，5173）。A2 通过 `WORKBENCH_ORIGIN` 指向它。
**理由**：spike 已验证此拓扑；fork 的生产托管（Remix/Cloudflare）与 A2 的
Vercel 部署是独立问题，本 change 不涉及。
**代价**：本地开发需起两个服务（写入 README）。

### D2. 跨源隔离契约（Spike C1/C2 固化）

- A2：COEP/COOP **仅**通过 `next.config.ts` `headers()` 加在 `/workbench/:projectId`。
  隔离页禁止引入无 CORP 的跨源资源（第三方字体/统计），workbench 页保持零外链。
- bolt fork：文档响应必须带 `Cross-Origin-Resource-Policy: cross-origin`
  （`entry.server.tsx` 已具备）。**生产部署时此头须在部署层再配一遍**（CDN/托管
  headers），不能只靠应用代码。
- iframe 属性固定：`allow="cross-origin-isolated"`，**不**加 `sandbox`
  （WebContainer 需要完整的同源能力；隔离边界由 COEP 体系承担）。

### D3. 缝合线协议（postMessage，双向 origin + token 校验）

消息统一信封 `{ source: "a2-workbench", type, token, ... }`（bolt→A2 为
`a2-workbench-ack` / `a2-workbench-event`），双侧 `event.origin` 白名单校验。

| 消息 | 方向 | 载荷 | 触发 |
|------|------|------|------|
| `handshake` | A2 → bolt | `{ token, project: { id, prompt, isNew } }` | iframe load 后 |
| `handshake-ack` | bolt → A2 | `{ token, ready, webcontainerLoaded }` | bolt 校验 token 后 |
| `artifact` | bolt → A2 | `{ token, files }`（`export('dist')` 文件树） | bolt "Save to A2" / 发布动作 |
| `artifact-ack` | A2 → bolt | `{ token, ok, savedAt }` | A2 落库成功 |

- token 由 `POST /api/workbench/token` 签发：**owner-only、一次性、5 分钟 TTL**，
  内存/DB 存储皆可（demo 用 DB 表 `WorkbenchToken`）。bolt 侧收到 handshake 后
  回传 token，A2 在 `artifact` 落库前**再次向服务端核销**——postMessage 通道
  不承载任何写库信任，最终写库请求走 A2 自己的 session cookie。
- bolt 收到 handshake 中的 `prompt` 且 `isNew` 时自动填入聊天输入框并提交
  （复用 bolt 现有 chat store API）；非新建项目打开 workbench 则载入既有上下文
  （MVP：仅恢复 prompt 历史摘要，文件恢复为后续项，见 Risks R5）。

### D4. 产物模型：文件树落库，`code` 保留扁平入口

- 新增 `Project.files String?`（JSON 序列化的 dist 文件树，来自
  `export('dist', { format: 'json' })`——spike 验证其返回对象而非字符串）。
- `Project.code` = `files["index.html"]` 的内容（dist 入口扁平化）。
  **理由**：画廊/详情页预览、public toggle、gallery-test 全部基于 `code`，
  保持零改动；多文件能力由 `files` 承载，互不阻塞。
- 保存时机：bolt 侧显式动作（Save to A2）→ `artifact` 消息 → A2 客户端携 session
  调 `POST /api/workbench/artifact`。**不**做自动保存（避免半成品覆盖）。

### D5. 生成入口改造（FR-01）

首页 prompt 提交 → `POST /api/projects`（新建：创建 Project，status=`generating`，
files=null）→ `router.push(/workbench/:id)`。workbench 完成保存后服务端将
status 置为 `completed`。原 `POST /api/generate` 及状态轮询路由**删除**。

### D6. 退役清单（多 Agent 编排放弃的落地）

删除：`src/lib/agents.ts`、`src/lib/pipeline.ts`、`src/app/api/generate/**`、
`AgentMessages.tsx`、store 中 generation/iteration 状态机（保留 auth/project 列表
部分）、home/detail 的 `ChatComposer` 用法。`Session`/`AgentMessage` 表保留
（历史数据可读），不再写入。

### D7. LLM 供应策略（接受偏差，显式记录）

bolt 沿用其浏览器端 provider 设置（Settings 面板，OpenAI-like base URL + key）。
demo 默认配置指向 Bailian DashScope 的 OpenAI 兼容端点（`models.ts` 现有 qwen 系），
通过 seam handshake 可预填 provider 配置（`handshake` 载荷预留 `provider` 字段）。
**这偏离 NFR-03「密钥仅服务端使用」**——见 R3。

## Risks / Trade-offs

- **R1 stackblitz.com 可达性（Spike C3）**：WebContainer boot 依赖外网拉取
  headless shell。缓解：workbench 加载失败时显示明确错误页（含原因）；内网部署
  方案另行评估。
- **R2 隔离页脆弱性（Spike C1）**：workbench 页任何无 CORP 跨源资源都会破坏隔离。
  缓解：该页不引入任何外链资源；CI 级手工检查清单写入 tasks。
- **R3 密钥在浏览器（D7）**：与 NFR-03 冲突。接受为 demo 级 trade-off；升级路径
  （A2 代理 bolt 的 LLM 流量）作为独立 change 记录在 proposal Non-Goals。
- **R4 bolt fork 升级成本**：fork 后上游修复需手动同步。缓解：fork 改动集中
  在 seam 层（`app/lib/a2-seam/` 新目录 + `root.tsx` 挂载点），最小侵入。
- **R5 项目文件恢复缺口**：MVP 重新打开 workbench 不恢复 WebContainer 文件树
  （bolt 无内建持久化挂载点可白嫖）。缓解：detail 页预览仍可用（读 `files`）；
  恢复能力列为后续 change（`webcontainer.mount(savedFiles)` 技术可行，spike 已
  验证 mount API）。
- **R6 preview 二次嵌套**：bolt 的 dev-server 预览本身是 iframe，嵌在 A2 iframe
  内（三层）。spike 未专门验证；实施阶段首测。

## Migration Plan

1. 先加后减：workbench 路由 + seam + artifact API 全部就位并自测通过后，
   才切换首页入口、删除旧 pipeline（保证任意一步可回退）。
2. 数据：存量 Project 的 `code` 不动，`files` 为 null → detail 预览回退读
   `code`（PreviewPane 已有此逻辑）。
3. Spike 清理按 `doc/spike-bolt-embed.md` 脚手架清单执行（试验页删除、
   `distDir` 还原、spike 桥接代码转正）。

## Open Questions

- 保存入口的交互位置：bolt 头部加 "Save to A2" 按钮（fork 改动）vs A2 侧悬浮
  条 postMessage 触发？倾向前者（状态可见性好），实施时定稿。
- `handshake` 预填 provider 配置的字段形态（直接 key vs 仅 base URL 提示）。
