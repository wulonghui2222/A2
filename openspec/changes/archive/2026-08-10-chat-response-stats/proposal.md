# Proposal: chat-response-stats

## Why

点击发送后到首个可见 token 之间，聊天界面没有任何反馈：用户无法区分模型正在思考、请求已挂起还是已经失败；失败时仅弹一个转瞬即逝的 toast，消息历史不留痕迹（关联用户故事 WB-01 聊天式生成、WB-06 服务端聊天持久化）。推理模型（qwen3.8-max）的首个 SSE 分片是 `reasoning_content`，正文延迟数秒出现，使这段"静默期"更长，可观测性缺失直接影响使用信心与问题排查效率。

## What Changes

- **请求状态机**：为每条助手消息引入显式状态 `submitting → waiting → streaming → finished / error`，替代当前仅有的 `isLoading` 布尔信号。
- **流式中实时反馈**：等待阶段显示计时（如"思考中… 2.1s"）；流式阶段显示耗时与生成速率（如"生成中… 4.7s · 128 tokens · 27 tok/s"）。
- **服务端时间统计注解**：扩展已有的 `usage` 消息注解，携带 `startedAt` / `firstVisibleTokenAt` / `endedAt` / `segmentCount`（MAX_TOKENS 续写段数），随消息持久化（WB-06），刷新后仍可查看。
- **每消息统计行扩展**：现有 `AssistantMessage.tsx` token 统计行增加"首字耗时 · 总耗时 · 生成速率"，如 `41 tokens · 首字 2.1s · 共 6.3s · 17 tok/s`。
- **错误状态留痕**：请求失败时在该条消息处内联展示状态与错误摘要（复用今日修复后的真实错误信息），而非仅靠 toast。
- UI 文案使用中文（遵循项目 UI 语言约定）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workbench`: 新增响应可观测性需求——聊天请求须呈现阶段化状态与时间统计，失败须留痕于消息历史。

## Scope Boundaries & Non-Goals

- **In scope**: 单次请求的状态与时间统计（客户端展示 + 服务端注解）、错误留痕。
- **Non-goals**:
  - 会话级聚合统计（平均 TTFT、今日总 token 等）——后续独立变更。
  - 设置中的 Debug 分解面板（网关延迟 vs 模型延迟的细粒度视图）——后续独立变更，可复用本次注解数据。
  - 网关侧（`api.llm.$.ts`）的延迟埋点——本次统计口径以 api.chat 服务端与客户端为准。
  - 历史消息回填统计数据——仅对新产生的消息生效。

## Impact

- **受影响代码**:
  - `workbench/app/routes/api.chat.ts` — 时间戳采集、usage 注解扩展、续写段计数
  - `workbench/app/lib/.server/llm/stream-text.ts` — 首可见 token 时间捕获（正文 delta 起点，区别于 reasoning 分片）
  - `workbench/app/components/chat/AssistantMessage.tsx` — 统计行扩展
  - `workbench/app/components/chat/Messages.client.tsx` / `Chat.client.tsx` — 状态机驱动、实时计时与速率显示、错误内联
- **API**: `/api/chat` 数据流中 `usage` 注解 payload 字段新增（向后兼容，客户端按可选字段处理）。
- **依赖**: 无新增依赖。
- **数据**: 消息注解体积小幅增加；无 schema 变更。
