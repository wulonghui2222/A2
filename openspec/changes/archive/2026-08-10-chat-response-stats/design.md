# Design: chat-response-stats

## Context

See proposal.md for motivation. Current state that shapes this design:

- `api.chat.ts` 已在流结束时通过 `createDataStream` 写入 `usage` 注解（token 统计），
  经 `SwitchableStream` 接到主流尾部；注解随消息持久化（WB-06）。
- `AssistantMessage.tsx` 已消费 `usage` 注解渲染 token 行。
- 客户端使用 AI SDK v4 `useChat`，可用回调：`onResponse`、`onFinish`、`onError`；
  状态信号目前只有 `isLoading`。
- 上游 qwen3.8-max 为推理模型：首个 SSE 分片是 `reasoning_content`，正文 delta 滞后出现。
- 超过 MAX_TOKENS 时 `api.chat.ts` 会切换续写流（continuation segments）。

## Goals / Non-Goals

**Goals:**

- 以最小侵入方式补齐"阶段状态 + 时间统计"，复用既有注解管道。
- 权威时间数据在服务端采集并随消息持久化。
- 流式过程中提供实时反馈（等待计时、生成速率）。

**Non-Goals:**

- 网关（`api.llm.$.ts`）与上游 DashScope 之间的分段延迟拆解。
- 会话级聚合、Debug 面板、历史消息回填。

## Decisions

### D1: 权威时间戳在服务端采集，扩展 `usage` 注解

`usage` 注解 value 增加 `timing` 字段（向后兼容，客户端按可选处理）：

```ts
{
  type: 'usage',
  value: {
    completionTokens, promptTokens, totalTokens,
    timing: {
      startedAt: number,            // Date.now()，请求处理开始
      firstVisibleTokenAt?: number, // 首个正文 text-delta 时间
      endedAt: number,              // 最终 onFinish 时间
      segmentCount: number          // 续写段数（无续写为 1）
    }
  }
}
```

- **首可见 token 时间**：优先使用 `streamText` 的 `onChunk` 回调，在首个
  `chunk.type === 'text-delta'` 时记录（reasoning 分片不计）。若 ai@4.0.18 的
  `onChunk` 不可用或不可靠，退路是在 `stream-text.ts` 包装 `result.textStream`
  迭代器记录首 delta 时间。实现时需先验证。
- `startedAt` 在 `streamText`（api.chat 包装层）入口记录；`endedAt` 在最终
  `onFinish`；`segmentCount` 在续写循环中递增，累计 usage 已存在，同一处扩展即可。
- **备选方案（否决）**：纯客户端打点——无法持久化、拿不到 segmentCount、
  且把网络往返混入模型耗时，排查价值低。

### D2: 阶段状态机在客户端由 useChat 信号推导

```
idle ──send──▶ submitting ──onResponse──▶ waiting
  ▲                                          │ 首个正文 delta（消息内容开始增长）
  │                                          ▼
  └── reset ── finished ◀── onFinish ── streaming
                  │
                  └── error ◀── onError（任意阶段）
```

- 状态存于 `Chat.client.tsx` 局部（useState），通过 props 传给
  `Messages.client.tsx`；不引入新 store——该状态生命周期与单次请求一致，
  无跨组件共享需求。
- `waiting → streaming` 的判据：最新 assistant 消息 content 长度由 0 变为 > 0
  （对推理模型，reasoning 分片不渲染为正文，天然满足"首可见"口径）。

### D3: 实时反馈组件

- 新增 `ResponseStats.tsx`（chat 组件目录）：
  - `waiting`：`思考中… X.Xs`（100ms 间隔计时器）。
  - `streaming`：`生成中… X.Xs · 约 N tokens · M tok/s`。
  - `finished`：并入 `AssistantMessage` 现有 token 行：
    `41 tokens · 首字 2.1s · 共 6.3s · 17 tok/s`（续写 >1 段时追加 `· N 段`）。
  - `error`：内联错误摘要（复用 `onError` 透传的真实错误信息）。
- **流式中 token 数是估算值**：usage 要到流结束才可用，实时显示按
  content 长度估算 token 数并标注"约"；完成后由权威 usage 替换。
  备选（否决）：流中经 SwitchableStream 周期性注入进度注解——
  侵入流管道、收益有限。

### D4: 错误留痕由客户端落盘

失败发生在服务端抛错（500）时，此时没有任何注解到达客户端，
因此错误记录只能在客户端 `onError` 中完成：

- 向最后一条 assistant 消息（不存在则创建占位消息）追加注解
  `{ type: 'status', value: { status: 'error', message, at } }`，
  content 为空或占位文案。
- `AssistantMessage` 识别 `status` 注解并渲染错误样式（不影响 `hidden` 等既有注解过滤逻辑）。
- 借助现有消息保存链路（Chat.client 的 messages 持久化）落库，满足刷新后可见。
  需注意与自动保存的防抖竞态：onError 中显式触发一次保存。

### D5: 功能开关

沿用 `app/a2/config.ts` 模式，新增 `A2_ENABLE_RESPONSE_STATS`（env 可覆盖，默认 true）。
关闭时：服务端不写 timing、客户端不渲染统计行，行为回退到现状。

## Risks / Trade-offs

- [ai@4.0.18 `onChunk` 支持不确定] → 实现首任务先验证；退路为包装 textStream 迭代器（D1 已述）。
- [流式中 token 估算不准（中英混合）] → UI 明确"约"，最终值以 usage 权威数据替换。
- [reasoning 分片可能被 SDK 丢弃不透出] → 不影响本设计：`waiting` 阶段本来就覆盖
  "无任何渲染输出"的时段，客户端口径与服务端 text-delta 口径一致。
- [onError 落盘与自动保存竞态] → D4 显式触发保存；验收场景覆盖"失败后刷新仍可见"。
- [注解体积增长] → timing 仅 4 个数字字段，可忽略。

## Migration Plan

- 注解字段纯增量，旧消息无 timing 时统计行回退为仅显示 token 数（现状），无迁移。
- 回滚：将 `A2_ENABLE_RESPONSE_STATS` 置 false 即回退现状，或整体 revert。

## Open Questions

- 统计行文案是否需要可折叠/弱化样式（避免长对话视觉噪音）——可在实现评审时定，不影响规格。
