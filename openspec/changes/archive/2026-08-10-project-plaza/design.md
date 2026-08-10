# Design: project-plaza（项目广场）

## Context

现状与约束（动机见 proposal.md - Why）：

- workbench（bolt.diy fork，Remix / React Router v7）为产品主体；定制代码按
  replatform 设计 D2 收敛于 `app/a2/`，对上游文件仅开关式改动。
- 服务端持久化为 Prisma + SQLite（User / Project / Message），Project 即一个
  chat；文件树只存在于客户端（nanostores + WebContainer FS），服务端从不直接
  持有文件内容。
- 术语遵循 openspec/config.yaml：代码与路由用 project，中文 UI 用"项目"。

## Goals / Non-Goals

**Goals:**

- 给出广场列表、公开只读详情、fileSnapshot 采集写入、公开开关、viewCount
  的可执行技术方案，实施者无需再做架构级决策。
- 公开路由完全免登录；非公开资源零信息泄漏（404）。
- 对上游 bolt 文件保持零结构改动。

**Non-Goals:**

- 不设计 tags / thumbnail 截图 / 社交互动（见 proposal Non-Goals）。
- 不优化 WebContainer 冷启动速度（首次访问等待依赖安装可接受）。

## Decisions

### D1 Schema：Project 直接扩三字段

`Project` 新增 `isPublic Boolean @default(false)`、`viewCount Int @default(0)`、
`fileSnapshot String?`（JSON 文本）。`prisma db push` 即可，默认值保证存量行
无需回填。

- 备选：独立 `PlazaEntry` 表关联 Project。否决：字段少、一对一关系，拆表只
  增加 join 与同步负担。

### D2 fileSnapshot 采集点：客户端采集，随保存上报

bolt 的文件树在客户端（files nanostore / WebContainer FS）。持久化适配器
（app/a2/）的保存调用扩展一个可选 `fileSnapshot` 载荷：客户端保存时序列化
当前文件树（路径 → 内容 的 JSON）一并 POST；服务端原样存入
`Project.fileSnapshot`。

- 备选：服务端从 Message JSON 解析 artifact 重建文件树。否决：正是本变更要
  避免的脆弱路径（消息格式随上游演进）。
- 大小护栏：快照载荷超过 2 MB 时服务端拒收并返回中文提示（引导精简项目），
  避免 SQLite 单行过大与传输负担。
- 时效语义：快照滞后于"最后一次保存"之后的未保存编辑，属预期行为（规格
  WB-06 场景已定义为 save time）。

### D3 路由：`/plaza` 列表 + `/plaza/$urlId` 公开详情

两个新 Remix 路由，均在 `app/a2/` 或 routes 层以独立文件新增（不动上游路由）：

- `/plaza`：loader 查 `isPublic = true` 的 Project（按 `viewCount desc`），
  只取 `urlId / description / viewCount`，不取快照（列表页不带文件内容）。
- `/plaza/$urlId`：loader 按 `urlId` 查项目；不存在或 `isPublic = false` 一律
  404；命中则原子自增 `viewCount`（Prisma `update` + increment），并把元数据
  交给客户端；快照由客户端再经资源路由按需拉取（避免 HTML 里内联大 JSON）。
- 资源路由 `GET /api/a2/plaza/$urlId/snapshot`：免登录，仅返回公开项目的
  `fileSnapshot`；非公开返回 404。

### D4 访客端 Preview 启动：独立轻量 boot 流程

公开详情页是独立页面（独立 browsing context），满足 WebContainer 单实例约束。
客户端流程：拉快照 → `WebContainer.boot()` → `mount(快照文件树)` → 依
package.json 执行安装与启动脚本（复用 bolt 既有依赖安装思路，简化为
`npm install` + 启动 dev script）→ iframe 指向就绪地址。安装或启动失败时
显示中文友好错误（规格 PL-02 场景）。

- 备选：复用 bolt 工作台整套 boot/terminal 组件。否决：深度耦合 chat、
  workbench stores 与权限假设，访客页不应引入。

### D5 访客端只读代码查看器：app/a2/ 自建轻量组件

用 fork 既有 CodeMirror 依赖实现只读文件树 + 只读编辑器（`readOnly`），
不复用 bolt 的 Editor（其绑定 workbench nanostores 与编辑能力）。

- 备选：bolt Editor 加只读开关。否决：需侵入上游组件 props 与 stores，违背
  D2 收敛原则。

### D6 公开开关：挂在"我的项目"页

`/my-projects` 每个项目卡片增加"公开到广场 / 取消公开"操作（中文文案）。
服务端资源路由 `POST /api/a2/projects/:id/visibility`（带 `{ isPublic }`），
session 校验 + owner 校验；置 true 时若 `fileSnapshot` 为空则拒绝并返回中文
引导（规格 WB-10 场景）。

- 备选：工作台 header 里加快捷开关。本期不做，入口收敛在"我的项目"页，
  减少状态同步面；后续可按需加。

### D7 历史数据

存量项目 `isPublic = false`、`fileSnapshot = null`，天然不出现在广场；owner
保存一次聊天即生成快照后方可公开，无需回填脚本。

## Risks / Trade-offs

- [快照与实时工作区不一致（未保存编辑）] → 语义已定义为 save time；公开开关
  提示文案注明"广场展示的是最近一次保存的版本"。
- [访客端依赖安装失败（缺锁文件、私有依赖）] → boot 失败统一中文错误页；
  不承诺所有项目可在访客端跑起来，规格只承诺友好提示。
- [大项目快照超限] → 2 MB 护栏 + 中文提示；后续需要再议压缩/增量。
- [viewCount 自增在 loader 中执行，爬虫/刷新会重复计数] → 与旧画廊口径一致，
  本期接受；后续需要真实 UV 再引入去重。
- [WebContainer 仅支持 Chromium 系浏览器] → 公开详情页注明浏览器要求，
  与工作台既有约束一致。

## Migration Plan

1. `workbench/prisma/schema.prisma` 扩字段 → `prisma db push`（默认值兜底，
   无需回填）。
2. 持久化适配器加快照采集与上报 → 保存链路回归（owner 侧不感知新字段）。
3. 广场列表 + 快照资源路由 + 公开详情页（访客链路端到端）。
4. "我的项目"公开开关 + visibility 资源路由。
5. 验收：owner 保存→公开→访客匿名打开 Preview/代码→取消公开 404 全链路。
   回滚：功能全部位于 `app/a2/` 新文件与三个新字段，移除开关入口并隐藏
   `/plaza` 路由即可下线；字段保留无副作用。
