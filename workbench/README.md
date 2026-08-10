# A2 Workbench

A2 Atoms 演示项目的 **Application Generation 工作台**：用自然语言生成、预览、迭代 Web 应用。

本项目基于 [bolt.diy](https://github.com/stackblitz-labs/bolt.diy) v0.0.5 **Fork & Replace** 改造：
工作台主体复用 bolt.diy，平台定制代码收敛在 `app/a2/` 目录与少量条件渲染开关内，
LLM 调用统一走平台网关（百炼），不再需要用户自带任何 API key。

## 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | ≥ 18.18（推荐 20+） |
| 包管理器 | pnpm（仓库使用 pnpm-lock.yaml） |
| 浏览器 | Chrome 或 Edge **最新版**（WebContainers 依赖 COOP/COEP 跨域隔离，不支持 Safari/旧版内核） |
| 网络 | 需联网：模型调用走百炼，WebContainer 运行时会从 CDN 加载 |

> 本项目定位为本地演示环境，不提供生产部署。

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量（凭证文件已 gitignore）
copy .env.example .dev.vars
#    编辑 .dev.vars，至少填写 BAILIAN_API_KEY、SESSION_SECRET、A2_INTERNAL_TOKEN

# 3. 初始化 SQLite 数据库（prisma/a2.db）
$env:DATABASE_URL = "file:./a2.db"; npx prisma db push   # Windows PowerShell
# DATABASE_URL="file:./a2.db" npx prisma db push          # bash

# 4. 启动开发服务器
pnpm dev
# 打开 http://localhost:5173
```

首次使用：注册账号 → 登录 → 首页输入需求点「发送」→ 右侧工作台自动生成并预览。
「我的项目」（右上角入口）可查看、打开、删除自己的历史项目。

## 环境变量（.dev.vars）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `BAILIAN_API_KEY` | 是 | 阿里云百炼（DashScope）API key，平台唯一 LLM 凭证，仅服务端持有 |
| `A2_DEFAULT_MODEL` | 否 | 平台默认模型，缺省 `qwen3.8-max` |
| `A2_SELF_BASE_URL` | 是 | 本机 dev server 源（`http://localhost:5173`），服务端自调用解析相对 `/api/llm` 用 |
| `SESSION_SECRET` | 是 | httpOnly JWT 会话 cookie 的 HMAC 密钥（本地随机串即可） |
| `A2_INTERNAL_TOKEN` | 是 | 服务端自调用网关的共享令牌（`x-a2-internal` 头） |

`.env.example` 中其余 provider key（GROQ/OPENAI 等）是上游 bolt.diy 的 BYOK 变量，
A2 界面已隐藏 BYOK 入口，**无需配置**。

## A2 定制说明（合并上游时参考）

- `app/a2/`：全部平台定制代码（config 常量、会话、Prisma、持久化适配器）
- `app/routes/api.llm.$.ts`：LLM 网关（注入百炼 key、session 校验、内部令牌豁免）
- `app/routes/api.projects*.ts`：项目/消息服务端持久化（替代 IndexedDB）
- `app/routes/{login,register,logout,my-projects}`：认证与「我的项目」
- `app/a2/config.ts` 中的 UI 开关（`A2_ENABLE_BYOK` / `A2_ENABLE_PROVIDER_SWITCH` 等）
  控制 BYOK、provider 选择、模型展示的隐藏；改回 `true` 即恢复上游行为
- 其余对上游文件的改动均为条件渲染/配置注入，带 `// A2` 注释标记

## 上游同步

```bash
git remote -v      # upstream = stackblitz-labs/bolt.diy
git fetch upstream
git merge upstream/main
```

冲突面集中在上表列出的少量文件；`app/a2/` 内无上游文件。

## 测试

三个入口（Windows PowerShell 与 Unix 均可运行）：

| 命令 | 说明 |
| --- | --- |
| `pnpm test` | 单元测试（Vitest，扫描 `app/**/*.spec.ts`） |
| `pnpm test:e2e` | E2E 测试（Playwright，`tests/e2e/*.spec.ts`） |
| `pnpm test:all` | 顺序执行单元 + E2E（node 脚本，跨平台） |

首次运行 E2E 需安装浏览器：`pnpm exec playwright install chromium`。

- E2E 由 `playwright.config.ts` 的 `webServer` 自动启动 `pnpm dev`（等待
  5173 就绪）；本地已开着 dev server 时直接复用（CI 上强制新起）。要对别的
  实例跑测试，设置 `E2E_BASE_URL`（此时不再自启服务）。
- LLM 全部由 Playwright 网络拦截打桩（`tests/e2e/fixtures/llm-stream.ts`），
  不消耗真实配额。
- 测试数据约定：E2E 使用随机后缀的唯一账号（`e2e…`），只读写自己创建的
  项目；套件结束后 teardown 尽力删除本次创建的项目记录（用户行保留，前缀
  便于人工清理）。单元测试使用 OS 临时目录里的独立 SQLite 库，不碰
  `prisma/a2.db`。
- 路由处理器的单测放在 `app/a2/route-tests/`：Remix 会把 `app/routes/` 下
  的每个文件注册为路由，因此 `*.spec.ts` 不能与路由同目录。
- Playwright 的产物与 HTML 报告写在 OS 临时目录下的
  `a2-workbench-e2e/`（`artifacts/` 与 `report/`，见
  `playwright.config.ts`）：部分机器上安全软件会拦截 Playwright 进程对
  仓库目录的写入（EPERM），临时目录可稳定规避。

## 致谢

本产品的交互主体来自 [bolt.diy](https://github.com/stackblitz-labs/bolt.diy)（StackBlitz，MIT License）。
