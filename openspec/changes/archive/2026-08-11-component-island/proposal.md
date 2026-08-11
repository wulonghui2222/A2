## Why

A2 平台目前只支持"完整 Web 项目"的生成，缺少轻量级的创意入口。用户（特别是非技术用户）希望能用一句话描述想法，快速生成一张桌面组件/Widget 风格的图片——用于社交分享、灵感收藏、或作为项目 UI 的视觉参考。组件岛（Widget Island）作为独立页面加入 A2，调用百炼 Wan3 模型实现文生图，与现有项目生成逻辑完全解耦。

## What Changes

- 新增 `/island` 路由页面：左右分栏布局，左侧输入框+生成按钮，右侧图片展示区（等待态 → 生成中 → 结果图）
- 新增 `POST /api/island/generate` 接口：接收用户输入，组装 prompt（加桌面组件风格引导词），提交异步任务到 DashScope Wan3 API
- 新增 `GET /api/island/task/:taskId` 接口：代理轮询 DashScope 任务状态，返回 `{ status, imageUrl? }`
- Header 导航新增"组件岛"入口链接
- 复用已有 `BAILIAN_API_KEY` 凭证和 `getSessionUser` 认证逻辑

### Scope / Non-goals

MVP 范围内：
- 单次生成一张图片，不做画布、拖拽、组件库浏览
- 不做历史记录/收藏/分享
- 不做 prompt 引导词的用户可配置

MVP 范围外（后续迭代）：
- 组件商店 / 分类浏览
- 画布空间（用户拖拽排列组件）
- AI 主题生成（配色方案 + 组件皮肤）
- 历史生成记录

## Capabilities

### New Capabilities
- `component-island`: 组件岛页面及后端 API——用户输入自然语言描述，调用 Wan3 模型生成桌面组件风格图片并展示

### Modified Capabilities
<!-- 无现有能力的行为变更。组件岛逻辑独立于项目生成、广场、认证等现有模块。 -->

## Impact

- **路由**: `workbench/app/routes/island.tsx`（新文件）
- **API 路由**: `workbench/app/routes/api.island.generate.ts`、`workbench/app/routes/api.island.task.$taskId.ts`（新文件）
- **导航**: `workbench/app/components/header/Header.tsx`（新增"组件岛"链接）
- **依赖**: 无新 npm 依赖；Wan3 通过 HTTP 直接调用 DashScope REST API
- **凭证**: 复用 `.dev.vars` 中已有的 `BAILIAN_API_KEY`
- **部署**: Cloudflare Workers 环境，`fetch` 调用外部 API 无限制
