# 测试报告：add-unit-e2e-tests

- **日期**：2026-08-10
- **范围**：`workbench/`（不涉及废弃的 `/src`）
- **结论**：✅ 全部通过 — 单元 139/139，E2E 10/10，`pnpm test:all` 退出码 0，E2E 连续两次运行结果一致

---

## 1. 总览

| 套件 | 入口命令 | 文件数 | 用例数 | 通过 | 失败 | 耗时（约） |
| --- | --- | --- | --- | --- | --- | --- |
| 单元（Vitest） | `pnpm test` | 19 | 139 | 139 | 0 | 6.9s |
| E2E（Playwright，Chromium） | `pnpm test:e2e` | 5 | 10 | 10 | 0 | 45s |
| 组合 | `pnpm test:all` | — | 149 | 149 | 0 | ≈ 2min（含 dev server 启动） |

## 2. 单元测试明细（19 个 spec 文件，139 用例）

| 文件 | 用例数 | 覆盖点 |
| --- | --- | --- |
| `app/lib/runtime/message-parser.spec.ts` | 24 | 既有：boltArtifact/action 解析 |
| `app/a2/session.server.spec.ts` | 19 | JWT 会话签发/校验/过期、loginRedirect、requireUser |
| `app/a2/route-tests/api.projects.$id.spec.ts` | 11 | 项目 GET/PUT/DELETE：鉴权 401、越权 403、更新消息/描述、删除 |
| `app/utils/projectCommands.spec.ts` | 9 | package.json 命令探测 |
| `app/a2/route-tests/api.projects.spec.ts` | 8 | 项目列表/创建：匿名 401、urlId 生成 |
| `app/a2/route-tests/api.a2.projects.$id.visibility.spec.ts` | 7 | 可见性切换：私有/公开、匿名访问 404/403 |
| `app/utils/shell.spec.ts` | 7 | shell 命令解析 |
| `app/components/chat/Markdown.spec.ts` | 6 | 既有：Markdown 渲染 |
| `app/utils/classNames.spec.ts` | 6 | class 拼接 |
| `app/utils/stripIndent.spec.ts` | 5 | 缩进剥离 |
| `app/utils/buffer.spec.ts` | 4 | buffer 编解码 |
| `app/lib/crypto.spec.ts` | 4 | 加密工具 |
| `app/utils/debounce.spec.ts` | 4 | 防抖 |
| `app/lib/fetch.spec.ts` | 3 | 网络层封装（mock） |
| `app/utils/promises.spec.ts` | 3 | promise 工具 |
| `app/a2/route-tests/plaza._index.spec.ts` | 3 | 广场列表 loader：仅公开项目、按浏览量排序 |
| `app/utils/folderImport.spec.ts` | 2 | 文件夹导入 |
| `app/utils/selectStarterTemplate.spec.ts` | 4 | 模板选择（fetch 打桩，含 blank 分支） |
| `app/utils/diff.spec.ts` | 10 | 既有 + 扩充 |

关键基础设施：
- 服务端测试夹具：临时目录 + `prisma db push` 建独立 SQLite 库，完全不碰 `prisma/a2.db`。
- 路由处理器单测放在 `app/a2/route-tests/`（Remix 会把 `app/routes/` 下所有文件注册为路由，spec 不能与路由同目录，否则 dev server 崩溃）。
- 期间修复 1 个测试 helper 缺陷：JS 默认参数在显式传 `undefined` 时仍会生效，401 用例改用 `null` 哨兵后通过。

## 3. E2E 测试明细（5 个 spec 文件，10 用例）

| 文件 | 用例 | 需求映射 |
| --- | --- | --- |
| `tests/e2e/auth.spec.ts` | 注册并自动登录；重复用户名拒绝；登录/登出往返；错误密码统一提示 | UA-01/02/03 |
| `tests/e2e/route-guard.spec.ts` | 未登录访问 `/chat/:id` 跳登录页，登录后带回跳并可见历史消息 | UA-04 |
| `tests/e2e/my-projects.spec.ts` | 新账号空状态；列表展示并可打开聊天页看到持久化消息 | WB-06/07 |
| `tests/e2e/gen.spec.ts` | 提交 prompt → 流式回复出现、artifact/文件动作被解析、获得 `/chat/` URL | FR-01/WB-01 |
| `tests/e2e/plaza.spec.ts` | 广场对匿名可读；公开→出现在广场可只读体验→取消公开后消失 | PL-01/02、WB-10 |

关键设计：
- **LLM 全打桩**：`page.route` 拦截 `/api/chat`（AI SDK v4 data-stream 格式）、`/api/llmcall`（返回 `blank` 模板跳过 GitHub）、`/api/llm/**`，零真实配额消耗。
- **唯一账号隔离**：每次运行随机 `e2e…` 账号；global teardown best-effort 删除本次创建的项目。
- **断言止于平台行为**（D5）：不依赖 WebContainer 构建结果。

## 4. 期间发现并解决的问题

| 问题 | 处理 |
| --- | --- |
| 路由 spec 放在 `app/routes/` 导致 dev server 崩溃 | 迁移到 `app/a2/route-tests/`，改用 `~/routes/` 别名导入 |
| 401 用例误带有效会话（默认参数哨兵失效） | 改用 `null` 哨兵 |
| Playwright 进程写仓库目录被 OS 拦截（EPERM） | artifacts/报告/账号记录全部落 OS 临时目录 `a2-workbench-e2e/` |
| 生成流用例在 5 worker 下偶发超时（Vite 冷编译竞争） | 新增 globalSetup 预热 `/`、`/login`、`/register`；workers 降为 2；连续两次全量运行 10/10 |
| 生成流标题断言 strict-mode 冲突（标题同时出现在头部与 artifact 面板） | 定位改为 artifact 面板的 toggle 按钮 |

## 5. 交付物

- 16 个新增/扩充单元 spec + 服务端测试夹具（`app/a2/`）
- 5 个 E2E spec + helpers/fixtures + global setup/teardown（`tests/e2e/`）
- `playwright.config.ts`、`scripts/test-all.mjs`、package.json 三入口
- workbench README「测试」章节、`.gitignore` 补充
- HTML 报告位置：`%TEMP%\a2-workbench-e2e\report\`（`pnpm exec playwright show-report <dir>`）

## 6. 已知限制

- E2E 不覆盖真实 LLM 调用与 WebContainer 构建（按设计 D3/D5 打桩并止于平台行为）。
- teardown 删除项目为 best-effort；`e2e…` 前缀用户行会保留在库中，便于人工识别清理。
