## Context

A2 workbench 基于 Remix (Vite) + Cloudflare Workers，已有 `/api/llm/*` 网关对接百炼 DashScope OpenAI 兼容模式。组件岛需要调用 DashScope 的另一套 API——Wan3 图片生成（异步任务模式），API 端点和调用模式与现有 LLM 网关完全不同。

参见 proposal.md — Why 了解动机。

## Goals / Non-Goals

**Goals:**
- 实现一个可用的组件岛页面，端到端跑通"输入 → 生成图片 → 展示"流程
- 复用现有认证和凭证体系，不引入新的配置项
- 代码结构与现有路由一致，便于后续迭代

**Non-Goals:**
- 不做画布拖拽、组件商店、历史记录等后续功能
- 不做 SSE/WebSocket 推送，MVP 用简单轮询
- 不做 prompt 模板管理或用户可配置引导词

## Decisions

### D1: Wan3 API 独立路由，不复用 /api/llm 网关

**决定**: 新建 `api.island.generate.ts` 和 `api.island.task.$taskId.ts`，不走 `/api/llm/*` 代理。

**理由**: `/api/llm/*` 是 OpenAI 兼容协议的流式代理（chat completions），而 Wan3 是异步任务 API（POST 提交 → GET 轮询），两者的请求/响应格式、端点、错误处理完全不同。强行复用会让网关逻辑变复杂且容易出错。

**替代方案**: 在 `/api/llm/*` 里加分支判断——放弃，复杂度不值得。

### D2: 前端 setInterval 轮询

**决定**: 前端用 `setInterval` 每 3 秒轮询 `/api/island/task/:taskId`。

**理由**: MVP 阶段简单可靠。Wan3 生成通常 10~30 秒，3 秒间隔用户体验可接受。组件卸载时 `clearInterval` 即可。

**替代方案**:
- SSE 包装：后端轮询推给前端——体验更好但复杂度高，MVP 不需要
- 长轮询：Cloudflare Workers 对长连接有限制

### D3: Prompt 引导词硬编码在后端

**决定**: 后端在 `api.island.generate.ts` 中拼接系统引导词 + 用户输入。

**理由**: MVP 阶段引导词固定，不需要动态配置。后续如果需要 A/B 测试或用户调整，再迁移到数据库或配置表。

引导词示例：
```
"A high-quality screenshot of a desktop with beautifully designed widgets: 
calendar, clock, photo wall, sticky notes, weather widget. 
Theme described by user: {userInput}. 
Modern flat design, soft pastel colors, rounded corners, clean layout."
```

### D4: 图片尺寸 1280×720

**决定**: 请求 Wan3 生成 `1280*720` 横屏图片。

**理由**: "桌面截图"概念天然适合横屏比例。Wan3 支持该尺寸。

### D5: UI 直接复用原型 HTML

**决定**: 页面 UI 直接 copy 原型文件 `C:/Users/chiju/WorkBuddy/2026-08-10-18-54-50/组件岛-Web首页原型.html` 中的 AI 主题生成器区块（`section#ai`）。

**理由**: 原型已完成视觉设计，直接复用避免重复设计工作，确保与预期一致。

**实现方式**: 将原型中的 HTML 结构和 CSS 样式（深紫渐变背景 `#ai`、`.ai-box` 左右分栏、`.ai-input` 输入区、`.ai-out` 展示区）转为 JSX + Tailwind/UnoCSS class，保留原型的配色变量和圆角卡片风格。MVP 仅实现 `section#ai` 区块，组件库筛选区（`section#widgets`）不在范围内。

**原型布局参考**:
```
┌─────────────────────────────────────────────────────┐
│ 深紫渐变容器 .ai-box（#171628 → #332a5e → #6d3f92） │
│ ┌───────────────────┐  ┌──────────────────────────┐ │
│ │ eyebrow: AI 主题  │  │  .ai-out 展示区           │ │
│ │ 生成器             │  │  (半透明卡片)              │ │
│ │ h2: 一句话，生成   │  │                          │ │
│ │ 一整个桌面。       │  │  空态: ✨ 等待你的第一    │ │
│ │ .desc 描述文字     │  │  个灵感…                  │ │
│ │ .ai-input         │  │                          │ │
│ │ [input] [生成]    │  │  加载态 / 结果图片         │ │
│ └───────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

- **[Wan3 生成质量不可控]** → 引导词需要反复调优。MVP 先硬编码一版，记录为已知风险。
- **[生成耗时 10~30 秒]** → 用户可能以为卡住了。加载态需要明确的进度提示（如"AI 正在生成中，请稍候…"）。
- **[Wan3 API 限流/配额]** → DashScope 可能有 QPS 限制。MVP 阶段不做限流，依赖 DashScope 自身的错误返回。
- **[图片 URL 有效期]** → DashScope 返回的图片 URL 可能有过期时间。MVP 阶段不做持久化存储，用户刷新页面后结果丢失，后续迭代再考虑。
