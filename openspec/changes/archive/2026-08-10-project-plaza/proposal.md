# Proposal: project-plaza（项目广场）

## Why

bolt-fork-replatform 时 FR-07 公开画廊被搁置（"后续再议"），workbench 成为产品主体后
一直没有任何公开分享与社区发现能力——用户生成的项目只能自己看。现在把"项目广场"
落到 workbench：owner 可以把项目公开，访客无需登录即可浏览广场、打开公开项目并
体验运行效果与阅读代码。旧 Next.js 外壳（`src/`）里的画廊是遗留代码，不在本变更
范围内，workbench 从零建设广场能力。

## What Changes

- **新增** 项目广场列表页 `/plaza`（无需登录）：列出所有公开项目，按 `viewCount`
  降序，卡片显示标题、描述、浏览量与占位缩略图。
- **新增** 公开项目详情页（访客视角）：基于 `fileSnapshot` 启动 WebContainer 渲染
  Live Preview，并提供**只读** Code Editor（可浏览文件树、阅读代码）；
  不展示聊天历史、不提供终端、不可编辑。
- **新增** owner 公开开关：在 workbench 的项目入口提供"公开到广场 / 取消公开"操作，
  公开时要求项目存在文件快照。
- **新增** 访客打开公开项目时 `viewCount` 自增（含 owner 本人访问，口径与旧画廊一致）。
- **新增** 文件快照持久化：owner 保存聊天时，服务端同步写入当前文件树快照
  `fileSnapshot`（JSON）；访客侧直接读快照重建文件树，跳过 message 解析。
- **扩展** `workbench` Prisma `Project` 模型：新增 `isPublic` / `viewCount` /
  `fileSnapshot` 三个字段。

## User Stories

- **US-10.1**：作为访客，我希望浏览项目广场并打开公开项目体验运行效果、阅读代码，
  以便获取灵感（对应 FR-07 旧故事 US-07.1 / US-07.2 的 workbench 版）。
- **US-10.2**：作为 owner，我希望能把自己的项目公开到广场或取消公开，
  以便分享作品并控制可见性。

## Scope Boundaries & Non-Goals

**In scope**：广场列表页、公开只读详情页（Preview + 只读编辑器）、公开开关、
viewCount 统计、fileSnapshot 写入与读取、Prisma schema 扩展、公开路由免登录。

**Non-goals**：

- 标签（tags）与标签过滤——广场本期不做分类。
- 缩略图生成（WebContainer 截图）——列表卡片统一使用占位图，不存 thumbnail 字段。
- 评论 / 点赞 / 收藏 / Fork（Remix 复制）/ 关注等社交互动——后续独立变更。
- 分页 / 无限滚动——假设公开项目数量可控。
- 旧 Next.js 外壳（`src/`）画廊的任何改动——遗留代码，规格已标记退役。
- 广场的推荐 / 趋势排序——仅 viewCount 降序。

## Capabilities

### New Capabilities

- `project-plaza`: 项目广场——公开项目列表浏览（无需登录）、公开项目只读体验
  （Live Preview + 只读代码编辑器）、浏览量统计。

### Modified Capabilities

- `workbench`: WB-06 服务端聊天持久化扩展——保存聊天时同步持久化文件树快照
  （fileSnapshot），供广场访客侧免解析重建文件；新增 owner 公开/取消公开开关。

## Impact

- **代码**（均在 `workbench/` fork 内，按 D2 收敛于 `app/a2/`）：
  - `prisma/schema.prisma` — Project 新增三字段
  - 新增 `/plaza` 路由与公开项目只读详情路由
  - `app/a2/` 持久化适配层 — 保存时采集并写入 fileSnapshot
  - 公开开关 UI（接入"我的项目"或工作台入口）
  - viewCount 自增资源路由
- **API**：新增广场列表查询、公开项目快照读取、viewCount 自增、公开开关 PATCH；
  公开路由不走 session 校验。
- **数据**：SQLite 无迁移负担（新字段带默认值）；历史项目 `fileSnapshot` 为空，
  需先保存一次（或由 owner 触发公开时生成）才能公开。
- **依赖**：无新增依赖（WebContainer / CodeMirror 均为 fork 既有）。
