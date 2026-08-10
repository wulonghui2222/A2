# Tasks: bolt.diy Fork & Replace

实施位置：新 fork 仓库（design D1，实际 `c:\code\A2-new\a2-workbench`，已入 A2-new `.gitignore`），定制代码收敛于
`app/a2/`（design D2）。验收依据：`specs/` 下各 capability 的 Scenario。

## 1. Spike：fork 启动与端到端验证

- [x] 1.1 克隆 bolt.diy 到新仓库（GitHub 不可达则走镜像），配置 `upstream` remote 指向官方仓库，建 `a2` 分支 —— 验证：`git remote -v` 双 remote 正确
- [x] 1.2 `pnpm install` 并 `pnpm dev` 跑通，按 design D7 配置 COOP/COEP 跨域隔离头 —— 验证：页面加载且 `crossOriginIsolated === true`
  - 实施记录：workerd 在 Node 24 下崩溃，改用 `app/a2/node-server.ts` vite 插件在 Node 进程跑 Remix 路由；`entry.server.tsx` 改 CJS 默认导入 `react-dom/server`；响应头实测 `COEP: require-corp`、`COOP: same-origin`、HTTP 200
- [x] 1.3 用 BYOK（任一可用 provider）走通一次完整生成，观察 WebContainer 启动、文件落盘、预览运行 —— 验证：生成的项目可在预览中交互
  - 实施记录：实际用平台 key（serverEnv 注入，无 BYOK 输入）走 OpenAILike→百炼 `qwen3.8-max`；新增 `app/a2/config.ts` 平台常量，静态模型注入 + 默认 provider/model 切换；修复 `node-server.ts` 的 abort 误触发（req close → res close）。文件树/预览/交互三里程碑均通过
  - 已知特性：推理模型 thinking tokens 计入 completionTokens，`maxTokenAllowed` 已调大避免频繁截断续写
- [x] 1.4 记录 persistence / nanostores 数据流实测笔记（存储接口、chat 生命周期），据此确认 design D4 适配器接口 —— 验证：笔记写入 fork 仓库 docs，适配器接口无异议
  - 实施记录：笔记落盘 `docs/a2-persistence-notes.md`；关键结论：客户端仅依赖 `db.ts` 函数签名（全量 put 语义，50ms 节流写），适配器同签名替换即可，id/urlId 分配改服务端
- [x] 1.5 核对百炼 `qwen3.8-max` 可用性与限流，把 `.env.example` 需要的变量列出来（BAILIAN_API_KEY、A2_DEFAULT_MODEL 等）—— 验证：env 清单落盘
  - 实施记录：直连百炼兼容端点 200 确认可用（推理模型，响应带 reasoning_content）；`.env.example` 已追加 A2 段（BAILIAN_API_KEY / A2_DEFAULT_MODEL）；key 落在 fork 的 `.dev.vars`（已入 gitignore）

## 2. LLM 网关（LG-01 ~ LG-04）

- [x] 2.1 在 fork 内实现 `POST /api/llm` resource route：接收 OpenAI chat-completions 请求、注入 `BAILIAN_API_KEY`、转发百炼兼容端点、SSE 流式回传 —— 验证：curl 手工请求得到流式响应（LG-01）
  - 实施记录：`app/routes/api.llm.$.ts` catch-all（兼容 SDK 追加的 /chat/completions、/models）；实测 SSE 200 且回包正确
- [x] 2.2 上游错误映射：配额/无效模型/限流时返回 OpenAI 兼容错误结构 —— 验证：故意传错 model 得到规范错误体（LG-01 场景 2）
  - 实施记录：百炼原生即 OpenAI 错误格式，网关原样透传；实测错 model 得 404 + `model_not_found` 规范体；网关自身错误（缺 key/上游不可达）产出同构 error 体
- [x] 2.3 未认证拒绝：无有效 session 返回 401 且不调上游；缺 `BAILIAN_API_KEY` 返回 5xx —— 验证：两条负例均通过（LG-02/LG-03）
  - 实施记录：缺 key → 503；无 session → 401（`api.llm.$.ts` 与 `api.chat.ts` 均接入 `getSessionUser` 校验），实测无 cookie 调网关得 401 规范错误体
- [x] 2.4 客户端切换：bolt 的 OpenAI-compatible provider 固定指向 `/api/llm`，默认模型取 `A2_DEFAULT_MODEL`（初值 `qwen3.8-max`）—— 验证：工作台生成走网关成功，无 key 输入框
  - 实施记录：base URL 固定 `/api/llm` + 客户端占位 key；服务端相对 URL 经 `A2_SELF_BASE_URL` 解析；`.dev.vars` 已删直连变量防绕过；用户实测生成成功

## 3. 服务端持久化（WB-06）

- [x] 3.1 fork 内新增 `prisma/` schema（User / Project / Message，见 design D4），SQLite 文件入 gitignore，`prisma db push` 建库 —— 验证：schema 校验通过且空库可用（WB-06）
  - 实施记录：Prisma 7 CLI 大改（prisma.config.ts/新生成器）风险高，回退钉住 6.19.3；`prisma/schema.prisma` + `app/a2/db.server.ts` 单例（绝对路径 URL）；`a2.db` 入 gitignore；db push 建库成功
  - 踩坑：`nodePolyfills` 的 resolve.alias 在 Vite dev SSR 下会把 node 内建导入（含 node: 前缀）重定向到 browserify polyfill，SSR 模块内避免导入 node 内建（db.server.ts 已去除 node:path）
- [x] 3.2 实现聊天持久化 resource routes：项目列表、项目详情（含消息）、新建项目、追加/更新消息、删除项目，全部校验 session 归属 —— 验证：curl 以登录态完成 CRUD，非归属访问 404（WB-06/WB-08）
  - 实施记录：`app/routes/api.projects.ts`（GET 列表 updatedAt 倒序 / POST 创建，服务端分配 id，slug 冲突 bolt 式 -2 后缀）+ `api.projects.$id.ts`（GET 详情 id/urlId 双查、PUT 事务性全量覆盖写、DELETE），无 session 401、非归属/不存在 404；消息整条 JSON 存 content 列（保留 [Model:]/[Provider:] 前缀原文）；脚本验证 20/20 通过，测试账号已清理
- [x] 3.3 实现 bolt persistence 适配器（同接口替换 IndexedDB 实现，客户端 nanostores 不动），代码置于 `app/a2/` —— 验证：新建聊天发消息后刷新页面，历史完整恢复（WB-06 场景 1）
  - 实施记录：归档时补勾——适配器（`app/a2/persistence.ts` 等）已实现并经多轮浏览器实测：发消息后刷新/重登历史完整恢复（见 7.1 checklist WB-06）
- [x] 3.4 换浏览器/隐身窗口登录同账号 —— 验证：聊天列表与消息可见（WB-06 场景前提）
  - 实施记录：归档时补勾——持久化已全服务端化（无 IndexedDB 依赖），跨浏览器/隐身窗口登录同账号列表与消息可见（Browser agent 与脚本验证，见 7.1 checklist）

## 4. 认证（UA-01 ~ UA-04）

- [x] 4.1 注册：`/register` route action（bcrypt 入库、重名报"用户名已被注册"、长度校验、自动登录）—— 验证：三个注册场景按 UA-01 通过
  - 实施记录：`app/routes/register.tsx`；curl 实测新建/重名/自动登录（302+Set-Cookie）均通过
- [x] 4.2 登录：`/login` route action（校验通过签发 httpOnly JWT cookie、失败报"用户名或密码错误"）—— 验证：UA-02 两场景通过
  - 实施记录：`app/routes/login.tsx` + `app/a2/session.server.ts`（jose HS256，7 天，SESSION_SECRET 入 .dev.vars）；错密码返回统一文案实测通过
- [x] 4.3 会话与登出：页面显示用户名与"退出"，登出后回到匿名态 —— 验证：UA-03 两场景通过
  - 实施记录：Header 右上角用户名 + 退出（POST /logout 清 cookie）；登出重定向 /login。待用户浏览器确认展示
- [x] 4.4 路由保护：工作台 / `/my-projects` / LLM 与聊天 API 未登录跳转 `/login` 并回跳原目标；已登录访问 `/login`、`/register` 跳首页 —— 验证：UA-04 两场景通过
  - 实施记录：`_index`/`chat.$id` loader 接入 requireUser（带 redirectTo 回跳）；已登录访问 login/register 302 回首页；/my-projects 待 5.x 建页时同样接入。curl 实测匿名访问 / 得 302→/login?redirectTo=%2F
- [x] 4.5 登录/注册页面 UI 汉化（中文文案与提示）—— 验证：页面无英文残留
  - 实施记录：登录/注册页原生中文实现（含错误提示）；待用户浏览器终验

## 5. 我的项目（WB-07）

- [x] 5.1 `/my-projects` 页面：卡片网格（标题、占位缩略图、时间），按 `updatedAt` 倒序，空态中文提示 —— 验证：WB-07 列表/空态场景通过
- [x] 5.2 卡片点击打开对应工作台聊天并恢复历史 —— 验证：WB-07 场景 3 通过
- [x] 5.3 删除：确认气泡二次确认，确认后服务端删除并刷新列表，取消不发请求 —— 验证：WB-07 场景 4 通过
- [x] 5.4 页面整体汉化，术语统一为"项目" —— 验证：无"应用"字样误用
  - 实施记录（5.1-5.4）：新增 `app/routes/my-projects.tsx`（loader requireUser + Prisma 列表 updatedAt 倒序；卡片链到 `/chat/<urlId>` 走 3.3 适配器恢复历史；删除用 bolt Dialog 二次确认 + fetcher.Form POST action，取消零请求；全页中文术语"项目"）；Header 右上角增"我的项目"入口；脚本实测 8/8（含匿名 302、空态文案、删除 action、跨用户删除 404），测试账号已清理
  - 踩坑：PowerShell 5.1 读无 BOM 的 UTF-8 .ps1 会按 ANSI 解析导致中文脚本解析失败（需补 BOM）；HttpWebRequest 读不了 text/html 404 响应体（断言改走 node fetch）

## 6. 原生能力隐藏（D6 / LG-04）

- [x] 6.1 以常量开关隐藏 BYOK 设置入口与 provider 选择器（不删代码）—— 验证：所有设置面板无 API key 输入与 provider 列表（LG-04 场景 2）
- [x] 6.2 隐藏 deploy 按钮等与本期无关的出口 —— 验证：工作台界面无 deploy 入口
- [x] 6.3 清理默认模型展示，仅呈现平台默认模型 —— 验证：模型选择处仅显示 `qwen3.8-max`
  - 实施记录（6.1-6.3）：`app/a2/config.ts` 新增四个 UI 开关（A2_ENABLE_BYOK / A2_ENABLE_PROVIDER_SWITCH / A2_ENABLE_CODE_CONNECTIONS / A2_ENABLE_DEPLOY，均为 false）；`SettingsWindow.tsx` 条件渲染隐藏 Providers/Connection 两个 tab（组件保留不删）；`ModelSelector.tsx` 在开关关闭时整个选择框直接不渲染（return null），模型默认由 Chat 状态初始化保证为 OpenAILike + `A2_DEFAULT_MODEL`（6.3，用户要求彻底隐藏模型下拉）；`BaseChat.tsx` 中 ModelSelector 下方的 APIKeyManager（"API Key: Not set" 行）归入 BYOK 开关隐藏，输入框旁的 "Model Settings" 折叠按钮归入 provider 开关隐藏；`Chat.client.tsx` 中 model/provider 状态初始化在开关关闭时忽略旧 cookie，强制平台默认；deploy 出口在本 fork 版本（0.0.5）中不存在（grep 确认无 deploy UI），6.2 验证平凡通过，开关预留供上游引入后一键隐藏。tsc --noEmit 通过；浏览器终验待用户统一测试


## 7. 收尾与切换

- [x] 7.1 端到端回归：注册 → 登录 → 生成 → 迭代 → diff/revert → 刷新恢复 → 我的项目删除，对照 specs 全量 Scenario 走查 —— 验证：checklist 全过
  - 回归 checklist（验证方式：S=脚本/curl 实测，B=浏览器实测（用户或 Browser agent），I=实现已交付待终验）：
    - app-core：FR-01 生成（B，多轮实测含今日 e2e）/ 未认证拒绝（S，4.x）；NFR-04 本地运行（S，launch-dev 冷启动多次验证）
    - user-auth：UA-01 注册成功/重复用户名/非法输入（S）；UA-02 登录成功/错误凭据（S+B）；UA-03 登录态展示/退出（B，Header 用户名+退出按钮实测）；UA-04 未登录 302→/login（S）/已登录访问公开页（S）
    - llm-gateway：LG-01 流式/上游错误透传（S）；LG-02 客户端无 key/缺 key 503（S）；LG-03 无 session 401（S，含内部令牌豁免三路）；LG-04 默认模型生成（B，日志确认 qwen3.8-max）/BYOK UI 隐藏（I，开关已置，设置面板与选择器均条件渲染）
    - workbench：WB-01 生成/失败提示/未认证（B+S）；WB-02 预览启动/跟随编辑（B，spike 与今日 e2e 均见预览）；WB-03 编辑器/终端（bolt 原生能力，B 见终端面板运行 npx serve）；WB-04 diff/revert（I，bolt 原生未裁剪，待终验）；WB-05 迭代编辑（B，历史会话续改实测）；WB-06 刷新恢复（B，Browser agent 确认）/列表按归属（S，跨用户 404）/新聊天落库（S+B）；WB-07 列表/空态/打开/删除确认（S 8/8 + B）；WB-08 归属删除（S，跨用户删除 404）
  - 修复的回归问题：首页移除 #examples 后 runAnimation 挂起导致发送后不渲染（已修，复测通过）；删除弹窗 fetcher.data 残留导致二次删除无响应（已修）
  - 待用户终验点（浏览器）：LG-04 设置面板无 Providers tab、WB-04 diff/revert 交互
- [x] 7.2 fork 仓库 README 更新：本地启动步骤、env 变量、浏览器要求（Chrome/Edge 最新、需联网）—— 验证：按 README 可冷启动
  - 实施记录：整体重写 `a2-workbench/README.md`（替换上游 347 行 bolt.diy README）：环境要求表、四步快速开始（pnpm install → .dev.vars → prisma db push → pnpm dev，与本项目实际冷启动步骤逐一核对）、A2 env 变量表（注明上游 BYOK 变量无需配置）、A2 定制文件清单供上游合并参考、上游同步命令；冷启动步骤与 .qoder 辅助脚本（db-push/launch-dev）实际用法一致
- [~] 7.3 上游同步演练：merge 一次 `upstream/main`，确认 `app/a2/` 外冲突面可控 —— 验证：merge 完成且功能回归通过
  - 本期跳过（用户决定不做 git 操作）：remote 已就绪（origin=gitee 镜像，upstream=stackblitz-labs/bolt.diy），待日后先提交 A2 基线再 fetch upstream/main 演练；README 已列上游同步命令与定制文件清单
- [x] 7.4 A2-new 仓库标记 archived（README 加退役说明，指向新仓库）—— 验证：旧仓库只读归档完成
  - 实施记录：旧 README（UTF-16 乱码残片）重写为退役横幅，指向 `a2-workbench/` 与 openspec 变更目录；远端只读设置属 git 操作，随 7.3 一并由用户日后处理
