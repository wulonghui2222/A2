## 1. Fork 整备与环境 (D1, D2)

- [x] 1.1 重命名 `spike-bolt/` → `workbench/`；保留 `postcss.config.mjs` 隔断；确认 `entry.server.tsx` 的 COEP/COOP/CORP 三头齐全（C2）
- [x] 1.2 将 `workbench/app/root.tsx` 中 `SPIKE ONLY` 桥接代码迁移为正式 seam 层 `workbench/app/lib/a2-seam/`（消息信封、origin 白名单、token 持有），root.tsx 仅保留挂载点；删除 build probe 代码
- [x] 1.3 A2 增加 `WORKBENCH_ORIGIN` 环境变量（`.env.local` = `http://localhost:5173`），`src/lib/workbench-config.ts` 统一读取并导出 origin 白名单
- [x] 1.4 README 增补“双服务启动”说明（bolt dev server + A2 dev server）

## 2. Schema 与 API (D4, D5, WE-02/WE-04)

- [x] 2.1 `schema.prisma`：`Project.files String?`；新模型 `WorkbenchToken { id, token, projectId, expiresAt, consumedAt? }`；`prisma db push` + generate
- [x] 2.2 `POST /api/projects`：认证用户创建项目（`prompt`, status=`generating`, files=null），返回 `{ projectId, status }`；匿名 401
- [x] 2.3 `POST /api/workbench/token`：owner-only 签发一次性 token（TTL 5 分钟）；非 owner 404；重复签发使旧 token 失效
- [x] 2.4 `POST /api/workbench/artifact`：owner-only 落库 `{ files }` → `Project.files` JSON、`code` = `files["index.html"]`、status=`completed`、`updatedAt` bump；核销对应 token；非 owner/无效 token 拒绝且不落库
- [x] 2.5 API 测试脚本 `tests/workbench-api-test.mjs`：覆盖 2.2–2.4 的正常与越权路径（沿用现有测试的登录/cookie 模式）

## 3. A2 Workbench 页 (WE-01, WE-03)

- [x] 3.1 `src/app/workbench/[projectId]/page.tsx`（server）：owner 校验，非 owner/匿名 404；`next.config.ts` `headers()` 从 spike 路由迁移到 `/workbench/:id`，删除 spike 条目
- [x] 3.2 Workbench client 组件：iframe `allow="cross-origin-isolated"`（无 sandbox）；加载后请求 token → 发送 `handshake`（含 prompt/isNew）；监听 `handshake-ack` 显示就绪态
- [x] 3.3 错误态：iframe 超时未 ack（30s）显示"工作台服务不可用"提示（R1）；页面保持零外链资源（R2 检查清单）
- [x] 3.4 `artifact` 消息 → 客户端携 session 调 `POST /api/workbench/artifact` → 成功后展示"已保存"，可跳转 `/projects/:id`

## 4. Bolt 侧 seam (D3, WE-03, WE-04)

- [x] 4.1 `a2-seam` 握手处理：校验 origin + token 后回 `handshake-ack`（含 webcontainerLoaded）
- [x] 4.2 初始 prompt 自动提交：`isNew` 时把 handshake 中的 prompt 注入 bolt chat store 并触发生成
- [x] 4.3 Save to A2：bolt 头部新增保存按钮（位置按 design Open Question 定稿）→ `export('dist', { format: 'json' })` → postMessage `artifact`；等待 `artifact-ack` 展示保存结果
- [x] 4.4 验证：嵌入态下生成 → 预览 → 保存 → A2 侧收到文件树（含 dist/index.html）

## 5. 生成入口切换 (D5, FR-01)

- [x] 5.1 首页 prompt 提交改为 `POST /api/projects` → `router.push(/workbench/:id)`；移除生成进度条/agent 消息流渲染
- [x] 5.2 store 清理：删除 generation/iteration 状态机与轮询，保留 auth/项目列表逻辑
- [x] 5.3 移除 home/detail 的 `ChatComposer` 用法与 `AgentMessages`；detail 页保留持久化预览 + Code 视图

## 6. 旧管线退役与 Spike 清理 (D6)

- [x] 6.1 删除 `src/lib/agents.ts`、`src/lib/pipeline.ts`、`src/app/api/generate/**`；`tsc --noEmit` 干净
- [x] 6.2 删除 `src/app/spike-workbench/`；`next.config.ts` 的 `distDir: ".next-rebuild"` 评估还原（若 `.next` 仍被锁则保留并注明）
- [x] 6.3 全链路回归：`tests/public-toggle-gallery-test.mjs` 等既有测试保持通过（`code` 兼容路径未破坏）

## 7. 测试与验证

- [x] 7.1 `tsc --noEmit` 干净；`workbench-api-test.mjs` 全绿
- [x] 7.2 手动 E2E：首页 prompt → workbench 自动开聊 → WebContainer 实时预览 → Save → detail 页预览为新产物 → gallery 可见
- [ ] 7.3 专项验证 R6（bolt dev-server 预览在三层 iframe 下可用）与 R5 边界（重开 workbench 不崩溃、detail 预览仍可读）
