# Tasks: add-unit-e2e-tests

所有任务均在 `workbench/` 目录内执行；不修改 `/src`（废弃目录）。
规则：单任务 ≤ 2 小时，每个任务可独立验证（验证方式：对应测试命令通过）。

## 1. 基线与基础设施

- [x] 1.1 运行现有 `pnpm test` 建立基线；确认既有 3 个 spec 文件（Markdown、
  message-parser、diff）全部通过，失败项先修复或记录（TS-01）
- [x] 1.2 确认/显式设置 vitest 仅扫描 `app/**` 的 `*.spec.ts`（如默认 include
  会扫到 tests/e2e，则在测试配置中显式限定），保证单元与 E2E 隔离（D2）
- [x] 1.3 安装 `@playwright/test` devDependency，执行
  `pnpm exec playwright install chromium`，新增 `playwright.config.ts`
  （Chromium only、`webServer` 启动 `pnpm dev` 等待 5173、
  `reuseExistingServer: !process.env.CI`、`baseURL` 支持 `E2E_BASE_URL` 覆盖）（D2）

## 2. 单元测试：app/utils

- [x] 2.1 `diff.spec.ts` 扩充 + 新增 `stripIndent.spec.ts`、`classNames.spec.ts`
  （TS-01）
- [x] 2.2 新增 `shell.spec.ts`、`promises.spec.ts`、`debounce.spec.ts`（TS-01）
- [x] 2.3 新增 `buffer.spec.ts`、`folderImport.spec.ts`（TS-01）
- [x] 2.4 新增 `projectCommands.spec.ts`、`selectStarterTemplate.spec.ts`
  （selectStarterTemplate 中 fetch 部分用 vi.mock 打桩）（TS-01）

## 3. 单元测试：app/lib 与 app/a2

- [x] 3.1 新增 `lib/crypto.spec.ts`、`lib/fetch.spec.ts`（网络层 mock）；确认
  runtime message-parser 既有测试仍通过（TS-01）
- [x] 3.2 搭建服务端测试夹具：临时目录 + `prisma db push` 建临时 SQLite 库，
  导出按临时库构造 PrismaClient 的 helper（不导入 db.server.ts）（D1、TS-01）
- [x] 3.3 新增 a2 持久化测试：项目创建/读取/更新/删除、urlId 唯一性、
  可见性字段读写（TS-01）
- [x] 3.4 新增 session.server 与 plaza 可见性判定测试（有效/过期会话、
  公开/私有项目对匿名访问的可见性）（TS-01）

## 4. E2E 脚手架与 LLM 打桩

- [x] 4.1 新增 `tests/e2e/helpers/`：唯一测试账号注册/登录 helper（随机后缀
  邮箱）、登录后状态复用（storageState 或 page 操作）（D4、TS-03）
- [x] 4.2 新增 `tests/e2e/fixtures/llm-stream.ts`：OpenAI 兼容 SSE 固定脚本流
  （含 boltArtifact 文件写入动作），并提供 Playwright `page.route` 拦截
  `**/api/llm/**` 与 `**/api/llmcall` 的挂载 helper（D3、TS-03）

## 5. E2E 用例

- [x] 5.1 认证流：注册新用户（UA-01）；登录与登出（UA-02/UA-03）（TS-02）
- [x] 5.2 路由保护：未登录访问 chat.$id 跳转登录页并带回跳（UA-04）（TS-02）
- [x] 5.3 我的项目：列表展示、打开项目聊天页、聊天持久化可见（WB-06/WB-07）（TS-02）
- [x] 5.4 生成流：挂载 LLM 打桩 → 提交 prompt → 断言流式消息与打桩内容出现、
  文件动作被解析（FR-01/WB-01，断言止于平台行为）（TS-02、D5）
- [x] 5.5 广场流：广场列表展示、公开项目只读体验（PL-01/PL-02）；可见性切换
  后广场生效（WB-10）（TS-02）
- [x] 5.6 suite 级 teardown：best-effort 删除本次运行创建的测试账号数据（D4）

## 6. 入口脚本与收尾

- [x] 6.1 package.json 新增 `test:e2e`（playwright test）与 `test:all`
  （node 脚本顺序跑 vitest + playwright，跨平台）（TS-04、D6）
- [x] 6.2 在 workbench README 补充测试章节：首次安装浏览器、三个测试入口、
  E2E_BASE_URL 用法、测试数据约定（TS-04）
- [x] 6.3 全量验证：干净环境下 `pnpm test` 与 `pnpm test:e2e` 均通过，
  `pnpm test:all` 退出码正确；连续两次运行 E2E 结果一致（TS-03、TS-04）
