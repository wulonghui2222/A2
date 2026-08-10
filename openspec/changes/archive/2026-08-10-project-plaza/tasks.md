# Tasks: project-plaza

## 1. 数据层

- [x] 1.1 `workbench/prisma/schema.prisma` 的 Project 增加 `isPublic` / `viewCount` /
  `fileSnapshot` 三字段（设计 D1），`prisma db push` 并确认存量行默认值正确
  （验收：db push 成功，Studio 可见三字段且存量行 isPublic=false / viewCount=0 /
  fileSnapshot=null）

## 2. fileSnapshot 采集与持久化（WB-06 扩展）

- [x] 2.1 客户端保存链路序列化当前文件树为 JSON（路径→内容），持久化适配器
  保存请求携带可选 `fileSnapshot` 载荷（设计 D2）
  （验收：抓包可见保存请求带快照载荷，格式为路径→内容 JSON）
- [x] 2.2 服务端保存接口写入 `Project.fileSnapshot`；载荷超 2 MB 拒收并返回中文提示
  （验收：保存后数据库 fileSnapshot 有值；构造超限载荷返回拒绝与中文提示）

## 3. 广场列表页（PL-01）

- [x] 3.1 新增 `/plaza` 路由：loader 免登录查公开项目（viewCount desc，仅取
  urlId/description/viewCount），卡片含标题、描述、浏览量、占位缩略图，中文文案
  （验收：匿名访问 200，排序正确，卡片信息完整）
- [x] 3.2 广场空态：无公开项目时显示中文空态提示
  （验收：空库下页面显示空态文案）

## 4. 公开详情与访客体验（PL-02 / PL-03）

- [x] 4.1 资源路由 `GET /api/a2/plaza/$urlId/snapshot`：免登录，仅公开项目返回
  快照，非公开/不存在返回 404（验收：三类请求返回正确）
- [x] 4.2 新增 `/plaza/$urlId` 路由 loader：按 urlId 查项目，非公开/不存在 404，
  命中原子自增 viewCount（验收：匿名访问命中 200 且 viewCount+1；非公开 404）
- [x] 4.3 访客端 Preview 启动：拉快照 → WebContainer boot + mount → npm install +
  dev script → iframe 渲染运行效果；失败显示中文友好错误（设计 D4）
  （验收：已公开的示例项目匿名打开可见运行中的 Preview；破坏快照可见中文错误）
- [x] 4.4 访客端只读代码查看器：文件树浏览 + CodeMirror 只读编辑器（设计 D5），
  无聊天/终端/编辑入口（验收：可切文件读代码，尝试编辑无效，无越权 UI）
- [x] 4.5 快照缺失兜底：isPublic=true 但 fileSnapshot 为空时显示中文友好提示
  （验收：构造该状态可见提示而非报错）

## 5. 公开开关（WB-10）

- [x] 5.1 资源路由 `POST /api/a2/projects/:id/visibility`：session + owner 校验；
  置 true 且无快照时拒绝并返回中文引导（验收：owner 切换成功；非 owner/匿名被拒；
  无快照置 true 被拒）
- [x] 5.2 "我的项目"页卡片增加"公开到广场 / 取消公开"操作与状态展示，中文文案，
  附"展示最近一次保存的版本"提示（验收：界面切换后广场可见性即时正确）
- [x] 5.3 工作台显式"保存"按钮（实施中发现的 UX 缺口：409 引导指向的"保存"原本只
  靠聊天自动保存触发）：聊天页 Header 增加保存按钮，点击立即收集文件快照并
  单独 PUT（不带 messages，服务端需保留原有消息），成功提示"已保存，可公开到
  项目广场"（验收：点击后 fileSnapshot 落库且消息不丢，随后可成功公开）

## 6. 端到端验收

- [x] 6.1 全链路手工验收：owner 生成→保存→公开→匿名访客浏览广场→打开 Preview
  与只读代码→viewCount 增长→owner 取消公开→访客 404（验收：各规格场景逐一通过）
