## 1. 后端 API — DashScope Wan3 集成

- [x] 1.1 创建 `workbench/app/routes/api.island.generate.ts`：实现 POST action，验证登录态（getSessionUser），从请求体提取 `prompt`，拼接桌面组件风格引导词，调用 DashScope Wan3 API（POST `https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis`），返回 `{ taskId }`
- [x] 1.2 创建 `workbench/app/routes/api.island.task.$taskId.ts`：实现 GET loader，验证登录态，调用 DashScope 任务查询 API（GET `https://dashscope.aliyuncs.com/api/v1/tasks/:taskId`），返回 `{ status, imageUrl?, message? }`
- [x] 1.3 手动测试：用 curl 或浏览器 devtools 调用 `/api/island/generate` 和 `/api/island/task/:taskId`，确认任务提交和轮询流程正常返回

## 2. 前端页面 — /island 路由

- [x] 2.1 创建 `workbench/app/routes/island.tsx`：直接 copy 原型文件 `组件岛-Web首页原型.html` 中 `section#ai` 区块的 HTML 结构和 CSS 样式，转为 JSX + Tailwind/UnoCSS。保留深紫渐变背景、`.ai-box` 左右分栏、`.ai-input` 输入区、`.ai-out` 展示区。仅实现 AI 生成器区块，不含组件库筛选区
- [x] 2.2 实现生成逻辑：点击"生成"按钮 → 校验非空 → POST `/api/island/generate` → 获取 taskId → 展示区切换为加载态
- [x] 2.3 实现轮询逻辑：setInterval 每 3 秒 GET `/api/island/task/:taskId`，根据 status 更新展示区（PENDING/RUNNING → 加载中，SUCCEEDED → 渲染图片，FAILED → 错误提示），组件卸载时 clearInterval
- [x] 2.4 展示区三态 UI：空态（"✨ 等待你的第一个灵感…"）、加载态（带旋转动画和"AI 正在生成中"提示）、结果态（渲染图片）

## 3. 导航集成

- [x] 3.1 在 `workbench/app/components/header/Header.tsx` 导航链接中新增"组件岛"入口，指向 `/island`，与"我的项目"和"项目广场"并列

## 4. 验证与收尾

- [x] 4.1 运行 `pnpm run typecheck` 和 `pnpm exec eslint`，确保无类型错误和 lint 警告
- [x] 4.2 启动 dev server（`pnpm dev`），端到端验证完整流程：登录 → 导航到组件岛 → 输入描述 → 点击生成 → 等待结果 → 图片展示
- [x] 4.3 验证未登录用户访问 `/island` 和 API 接口的拦截行为
