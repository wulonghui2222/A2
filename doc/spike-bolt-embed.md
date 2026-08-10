# Spike 结论笔记：bolt.diy 嵌入验证（形状 B 前置实验）

- **日期**：2026-08-10
- **背景**：探索"核心功能 Application Generation 使用 bolt.diy 重写"（形状 B：A2 退化为门户 + API，bolt fork 作为生成工作台，iframe 嵌入）。
- **目标**：验证三条技术前提——
  1. WebContainer 能否在**被嵌入且跨源隔离委派**（`allow="cross-origin-isolated"`）下正常 boot；
  2. WebContainer 内 **build 与 dist 导出**的可行性；
  3. **token / postMessage 握手**通路。

## 实验拓扑

```
A2 (Next.js, localhost:3000)
  /spike-workbench（一次性试验页）
    COEP: require-corp + COOP: same-origin（仅该路由）
    └── iframe src="http://localhost:5173" allow="cross-origin-isolated"
          bolt.diy（clone 于 spike-bolt/，pnpm dev）
            COEP/COOP 由 app/entry.server.tsx 设置
            WebContainer.boot({ coep: 'credentialless' })
```

## 验证结果：3/3 通过 ✅

| # | 验证项 | 结果 | 证据 |
|---|--------|------|------|
| ① | 嵌入 iframe + 隔离委派下 WebContainer boot | 通过 | 握手 ack：`crossOriginIsolated: true, webcontainerLoaded: true` |
| ② | WebContainer 内 build + dist 导出 | 通过 | mount 最小项目 → `npm run build` → `exit 0` → `export('dist')` 返回 `{ index.html }` |
| ③ | token / postMessage 握手 | 通过 | token 原样回传；双侧均校验 `origin`；控制台零错误 |

补充观察：

- bolt 页面加载即触发 WebContainer boot（模块导入副作用），headless shell 自
  `https://stackblitz.com/headless?coep=credentialless` 拉取成功。
- `@webcontainer/api` 的 `export(path, { format: 'json' })` 返回结构化文件树
  （对象，非字符串），可直接用于产物回传。

## 实测踩出的四个关键约束（必须写入未来 design.md）

### C1. 父页必须跨源隔离，且要限定路由

A2 承载 workbench 的页面必须返回
`Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin`。
隔离页内**不能**出现无 CORP 声明的跨源资源（第三方统计、外链字体、CDN 图片等），
否则整页失去 `crossOriginIsolated`。→ 隔离头只加在 workbench 路由，不全站生效。
（已在 `next.config.ts` 的 `headers()` 中按路由验证可行。）

### C2. bolt 文档响应必须带 CORP（本次最有价值的发现）

bolt 自带 COEP/COOP，但**没有** `Cross-Origin-Resource-Policy`。
缺少它时 iframe 文档请求被浏览器直接拦截：`ERR_BLOCKED_BY_RESPONSE`，
iframe origin 变成 opaque `'null'`，表现为 postMessage 报
"target origin does not match ('null')"——**错误信息有迷惑性，实际是 CORP 缺失**。

- 本地修复：`spike-bolt/app/entry.server.tsx` 追加
  `Cross-Origin-Resource-Policy: cross-origin`。
- **生产部署要求**：此头必须在部署层（CDN / 托管平台 headers 配置）落实，
  不能只依赖应用代码。

### C3. WebContainer 运行时依赖外网

boot 需用户浏览器可访问 `stackblitz.com`（拉取 headless shell）。
A2 的目标用户网络环境若受限（如内网/墙内），需要评估镜像或自托管方案。

### C4. 开发环境的 postcss 陷阱（仅影响 spike 布局，不影响生产）

bolt 克隆放在 A2 目录内时，Vite 会向上遍历目录树拾取 A2 的
`postcss.config.mjs`（Tailwind 插件），导致 bolt CSS 编译 500。
已在克隆目录放置空 `postcss.config.mjs` 隔断。
bolt fork 独立仓库部署时此问题不存在。

## 对形状 B 设计的影响

- 缝合线三根管道（认证握手下发 / 指令下行 / dist 产物上行）**全部技术可行**。
- `export()` 返回结构化文件树 → A2 侧可直接解析 dist 写回 `project.code`
  或对象存储，无需 zip 中转。
- 新增架构约束：workbench 路由级 COEP 隔离 + bolt 部署层 CORP 头 +
  stackblitz.com 网络可达性，三者进入 design.md 的 Decisions/Risks。
- 尚未验证（留给 change 实施阶段）：真实 LLM 生成链路（本地无 API key）、
  dev server preview 端口在 iframe 内的二次嵌入、生产构建（`pnpm build`）下
  头配置是否一致。

## Spike 脚手架清单（change 落地后需清理）

| 位置 | 内容 | 处理 |
|------|------|------|
| `src/app/spike-workbench/page.tsx` | A2 试验页（iframe + 握手 + build probe） | 删除 |
| `next.config.ts` | `headers()` 隔离头、`distDir: ".next-rebuild"` | 隔离头迁到正式 workbench 路由；distDir 可还原 |
| `spike-bolt/`（bolt.diy 浅克隆） | 全部 spike 改动的宿主 | 保留为 fork 起点或删除 |
| `spike-bolt/app/root.tsx` | 握手 ack + build probe（标注 `SPIKE ONLY`） | 移植到 fork 的正式通信层后删除 |
| `spike-bolt/app/entry.server.tsx` | CORP 头 | 保留（并入 fork） |
| `spike-bolt/postcss.config.mjs` | 隔断 A2 postcss | 独立仓库后删除 |

## 复现方式

```powershell
# 终端 1：bolt
Set-Location C:\Users\chiju\A2\spike-bolt
$env:Path = "C:\Program Files\nodejs;$env:Path"
corepack pnpm run dev          # → http://localhost:5173

# 终端 2：A2
Set-Location C:\Users\chiju\A2
& "C:\Program Files\nodejs\node.exe" node_modules\next\dist\bin\next dev -p 3000

# 浏览器打开 http://localhost:3000/spike-workbench
# 点 "Send handshake"（预期 acked，payload 含 webcontainerLoaded:true）
# 点 "Run build probe"（预期 ok:true, exitCode:0, distFiles:["index.html"]）
```
