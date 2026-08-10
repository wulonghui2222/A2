先看清这次"重写"到底在换什么
A2 现在的生成核心是"服务端流水线 + 单文件 HTML"：
┌─────────────────── A2 现状 ───────────────────┐
│                                                │
│  用户 prompt                                    │
│     │                                          │
│     ▼                                          │
│  POST /api/generate ──► 服务端 pipeline          │
│     │                  PM → Architect → Engineer│
│     │                  (每步一次 LLM 调用)        │
│     ▼                                          │
│  project.code = 一个大 HTML 字符串 (存 SQLite)    │
│     │                                          │
│     ▼                                          │
│  <iframe srcDoc sandbox> 预览                    │
│                                                │
└────────────────────────────────────────────────┘
bolt.diy 的核心是"浏览器内全栈运行时"：
┌─────────────────── bolt.diy ───────────────────────┐
│                                                     │
│  prompt ──► LLM 流式输出"artifact"                    │
│               │  (XML 风格: <boltArtifact>           │
│               │   内嵌 file / shell action)          │
│               ▼                                     │
│         解析器实时执行 action                          │
│               │                                     │
│      ┌────────┴────────┐                            │
│      ▼                 ▼                            │
│  写文件到            跑 shell 命令                    │
│  WebContainer       (pnpm install / dev)            │
│  虚拟文件系统                                             │
│      │                 │                            │
│      └────────┬────────┘                            │
│               ▼                                     │
│     WebContainer 里的 Vite dev server                │
│               │                                     │
│               ▼                                     │
│     真实 Node 应用的实时预览 + 内置终端                   │
└─────────────────────────────────────────────────────┘
这不是"换个生成算法"，而是产出物从"一个 HTML 文件"升级为"一个可运行的 Node 项目"——能生成带路由、带依赖、带 npm 包的全栈应用。这大概是你要这个重写的核心动机？

现状 vs bolt.diy：错位在哪些维度
维度	A2 现状	bolt.diy	错位程度
运行时	Node 服务端生成	WebContainers 浏览器内运行	🔴 根本性
产出物	单文件 HTML	多文件 Vite/Node 项目	🔴 根本性
技术栈	Next.js 15 App Router	React Router 7 + Vite + Wrangler	🟠 大
LLM 调用	服务端代理（NFR-03 要求）	客户端直连为主（keys 存 cookie），有 server proxy	🟠 中
持久化	Prisma/SQLite，服务端所有权	IndexedDB + WebContainer FS，纯本地	🔴 根本性
认证	NextAuth，项目归属用户	无用户体系（单机工具定位）	🟠 大
迭代方式	整份代码重新生成	search/replace diff + revert + 快照	🟢 可借鉴
注意两个 🔴：持久化模型和 WebContainers。前者决定你的画廊/分享/多设备还有没有意义，后者决定部署形态。

三种重写形状
形状 A：Fork & Replace（bolt.diy 成为主体）
┌────────────────────────────────────────────┐
│  bolt.diy fork = 新的生成工作台                │
│  ├─ 保留：WebContainers、artifact 流、终端、编辑器 │
│  ├─ 改造：登录（NextAuth?）、聊天持久化 → 服务端 API │
│  └─ 嫁接：画廊 / 我的项目 / 公开开关              │
└────────────────────────────────────────────┘
A2 现有 Next.js 外壳 → 大部分废弃或降级为 API 服务
● ✅ 最快拿到完整 bolt 能力（19+ provider、diff、revert、deploy）
● ❌ A2 现有的认证/持久化/画廊要逆向嫁接进一个 Vite+React Router 应用，等于重写两遍
● ❌ 之后跟上游同步是持续成本（虽说不考虑许可证，但社区演进很快）
形状 B：双应用 + 嵌入
┌──── A2 (Next.js) ────┐        ┌── bolt.diy fork ──┐
│ 认证 / 画廊 / 项目列表    │ iframe │ 生成工作台          │
│ 项目元数据 + 文件快照     │◄─────►│ postMessage 协议    │
│ 公开分享               │        │ (COOP/COEP 子域)   │
└──────────────────────┘        └───────────────────┘
● ✅ 现有资产全保留，bolt 侧独立演进
● ❌ 两套应用、跨域协议、会话传递；COOP/COEP 要求工作台必须在独立子域（Cross-Origin-Opener-Policy 会破坏与父页的 window.opener 关系）
● ❌ 画廊里"点开即预览"别人的项目变得很重——访客浏览器里也要 boot 一个 WebContainer
形状 C：移植引擎（保 Next.js 外壳，换生成内核）
┌─────────────── A2 (Next.js 不变) ────────────────┐
│  首页/详情页 → 工作台视图（移植 bolt 的 UI 模式）          │
│     ├─ artifact 流式解析器（port workbench 逻辑）      │
│     ├─ WebContainers boot（客户端，COOP/COEP headers） │
│     ├─ 文件树 + CodeMirror 编辑器 + 终端                │
│     └─ LLM 仍走 /api/generate 服务端代理                │
│  持久化：文件树 JSON/ZIP 存 Prisma，替换 project.code    │
└────────────────────────────────────────────────────┘
● ✅ 架构一致性最好，NFR-03（keys 服务端）天然满足，画廊/分享/认证不动
● ❌ 工作量最大：等于把 bolt 的 workbench（~数千行核心）手工搬进 Next.js
● ❌ 你放弃了 bolt 社区后续的免费升级

决定一切的硬约束：WebContainers
无论哪种形状，只要你要"bolt 式体验"（跑真 Node、真 npm、真 dev server），就绕不开：
1. 跨源隔离：整站（或工作台子域）必须发 Cross-Origin-Opener-Policy: same-origin + Cross-Origin-Embedder-Policy: require-corp。副作用：
  ○ 你现在的预览 bridge（postMessage）没问题，但所有跨域资源（图片、字体）都要带 CORS 头或 crossorigin，否则加载失败
  ○ 画廊里嵌第三方内容会更麻烦
2. 每页一个实例：一个 tab 只能 boot 一个 WebContainer。详情页预览别人的项目 = 访客浏览器现场 boot，冷启动秒级，移动端基本没戏
3. 浏览器支持：Chromium + Firefox 可用，iOS Safari 不可用 → NFR-02"移动端基本可用"直接冲突
4. 内存/CPU：浏览器内跑 npm install，低端机器体验差
一个折中变量值得摆上桌面：你要不要 WebContainers？
要 WebContainers                不要 WebContainers
          ┌──────────────────────┐       ┌─────────────────────────┐
产出物      │ 真 Node 全栈应用        │       │ 仍是静态产物，但升级为      │
          │ (bolt 全能力)          │       │ 多文件 HTML/JS/CSS +       │
          │                      │       │ Vite 构建 or 沙箱 iframe   │
          ├──────────────────────┤       ├─────────────────────────┤
代价       │ COOP/COEP、子域、       │       │ 拿到 bolt 的 artifact 流、   │
          │ 移动端降级、画廊变重      │       │ diff/revert、编辑器体验，     │
          │                      │       │ 预览保持现有沙箱模式           │
          └──────────────────────┘       └─────────────────────────┘
右半边其实是一条"偷 bolt 的魂、不换 bolt 的命"的路线：移植 artifact 协议 + 流式文件生成 + diff 迭代 + 编辑器，但预览继续用你刚建好的 sandboxed iframe + bridge。多文件产物可以在服务端跑一次构建（或干脆生成无构建的 ES modules 多文件应用，import map 直接跑在 iframe 里）。

连带会被改写的东西
如果走多文件方向，这些现有契约全部动摇：
● 数据模型：Project.code: string → 文件集合（新表 ProjectFile 或 JSON/ZIP blob）。iterate API、status API 返回 code 的语义都要变
● FR-02 多 Agent：bolt 是单轮对话单模型。PM → Architect → Engineer 的编排还留吗？一个自然的融合是：PM/Architect 产出物变成喂给 bolt artifact 流程的首个结构化 prompt，Engineer 角色被 artifact 流取代
● FR-08 迭代：从"整份重生成"升级到 bolt 的 search/replace diff —— 这是体验上最值钱的单点
● NFR-03：若保留服务端代理（形状 B/C），现有约束满足；形状 A 若沿用 bolt 的客户端 key 模式则违反，需要改 bolt 的 provider 层走你的 /api 代理
● NFR-04 Vercel 一键部署：COOP/COEP 头在 Next.js config 里能加，但 Vercel 上跑 WebContainers 只是"前端 boot"，没问题；问题在于生成出的用户应用怎么部署（bolt 自带 Netlify/Vercel 部署集成，这是加分项）

悬而未决的线头（挑你感兴趣的）
1. 目标产出物：你真正想要的是"能生成全栈 Node 应用"（必须 WebContainers），还是"生成过程的体验升级"（流式文件、编辑器、diff、终端可视化）？这决定形状。
2. A2 的身份：A2 是"分享型画廊平台"（重服务端持久化/访客预览）还是"个人工作台"（重本地能力）？bolt.diy 天生是后者，你的画廊是前者——两者张力最大。
3. 多 Agent 编排去留：这是 A2 目前区别于 bolt 的唯一叙事，重写后是保留、融合还是放弃？
4. 移动端：可以接受"生成/编辑桌面端限定，移动端只读预览"吗？
5. 工作量预期：形状 A 最快见效（fork 能跑）但长期嫁接成本高；形状 C 最慢但最干净。你的时间预算量级是？
我的直觉倾向：如果 A2 的画廊/分享是核心资产，形状 C 的"偷魂不换命"变体（artifact 流 + diff 迭代 + 多文件产物，但暂不引入 WebContainers，预览留在现有沙箱体系）是风险收益比最好的一档；等真需要跑 Node 后端时再把 WebContainers 作为二期加进来。但如果你要的就是"demo 时能生成真全栈应用"的震撼感，那只能选 A/B 拥抱 WebContainers。