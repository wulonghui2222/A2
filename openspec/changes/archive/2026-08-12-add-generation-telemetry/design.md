# Design: add-generation-telemetry

## Context

动机见 proposal.md。现状约束（探索阶段已核实的代码事实）：

- LLM 流时间段已有服务端权威计时（`usage` 注解 `timing: {startedAt, firstVisibleTokenAt, endedAt, segmentCount}`，见 `api.chat.ts`），本次不重复建设，直接引用。
- 动作由 `ActionRunner` 串行 promise 链执行；文件动作在流式期间以 100ms 采样边流边写；shell 动作等待 OSC `exit`，无超时；start 动作非阻塞。
- 页面重载后 `parseMessages` 会重解析全部历史消息并重跑所有动作（历史项目预览启动即依赖此机制）——replay 是必须单独度量的一等场景。
- 消息持久化为"每 50ms 采样 PUT 全量消息"（A2 服务端持久化），消息注解随 `setMessages` 落库；已有先例在流结束后显式补存一次注解（error status 注解）。
- A2 嫁接层惯例：定制代码收敛于 `app/a2/`，bolt 原生文件仅做最小开关式修改。

## Goals / Non-Goals

**Goals:**

- 每轮生成产出一条可直接回答"瓶颈在哪一段"的时间轴数据（wait / stream / 动作执行 / start→preview / tail）。
- 区分 `fresh`（实时生成）与 `replay`（重载重放）两类轮次。
- 中断事件（LLM 错误、abort、段数上限、未闭合 artifact）随轮次留痕。
- 数据随消息持久化，事后仍可分析；呈现面板默认关闭、终端用户不可见。

**Non-Goals:**

- 不做服务端聚合、不改生成/执行逻辑、不面向终端用户展示（见 proposal Non-goals）。

## Decisions

### D1: 收集器归属 `app/a2/telemetry.ts`，bolt 原生文件只做最小 tap

新建 `app/a2/telemetry.ts`（nanostores map + 纯函数收集器）。bolt 原生文件（`action-runner.ts`、`previews.ts`、`webcontainer/index.ts`、`message-parser.ts`、`Chat.client.tsx`）仅插入单行 tap 调用，tap 本身无条件执行且开销为纳秒级（一次函数调用 + 收集器内部判断），**不用 flag 包裹调用点**——flag 只控制面板渲染。
备选：在 bolt 文件内直接实现收集逻辑——违反嫁接层隔离惯例，放弃。

### D2: 轮次定义与生命周期

一轮 = 一条用户消息触发的 assistant 响应。轮次以 assistant `messageId` 为 key，状态机：
`send → firstToken → streamEnd(ok|error|interrupted) → actionsDrained → previewResolved → finalized`。
- `firstToken` / `streamEnd(ok)` 时间戳优先取服务端注解值（客户端在流结束时已可读到 usage 注解）；读不到时回退客户端状态机时间。
- `actionsDrained`：流结束后等待该轮 ActionRunner 执行链空闲且无 pending 动作。
- `previewResolved`：`actionsDrained` 后进入最多 30s 的宽限期，等待 `PreviewsStore` 端口 `open` 事件；到期未就绪记 `preview: { timeout: true }`。本轮无 start 动作则跳过宽限期直接 finalize。
- finalize 时写入注解（D3）并显式调用一次 `storeMessageHistory`（沿用 error 注解的补存先例）。
备选：以 artifact 闭合为轮次终点——多 artifact 轮次语义混乱，放弃。

### D3: 遥测注解 schema（版本化、附加字段）

挂在 assistant message 的注解：

```ts
{ type: 'telemetry', value: {
  version: 1,
  source: 'fresh' | 'replay',
  startedAt: number,                    // 用户发送时刻
  phases: { waitMs?, streamMs?, tailMs? },
  actions: [{ id, type, command?, startedAt, durationMs, status, exitCode? }],
  preview: { openedAt?, startToPreviewMs?, timeout? },
  interrupts: [{ kind: 'llm-error'|'abort'|'segment-limit'|'unclosed-artifact', at }],
  webcontainerBootMs?,
} }
```

约束：`command` 截断至 200 字符；单条注解序列化上限 8KB，超限丢弃 `actions[].command` 字段；replay 轮次**不落库**（仅内存/面板可见），避免覆盖原始 fresh 注解。
备选：独立遥测路由/表——超出本次范围，放弃。

### D4: 中断与未闭合 artifact 检测

- `llm-error` / `abort`：来自 `useChat` 的 `onError` 与现有 `abort()` 调用点（tap）。
- `segment-limit`：服务端在 `Cannot continue message` throw 前无法写注解，客户端以"流异常结束且无 usage 注解"推断并记录（近似即可，design 接受此误差）。
- `unclosed-artifact`：`StreamingMessageParser` 新增只读方法 `getOpenState(messageId)`（返回 `insideArtifact/insideAction`），收集器在 `streamEnd` 时读取——**不改变任何解析行为**。

### D5: shell 命令分类

按命令前缀分类：`npm install`/`pnpm install` → `install`；`npm run`/`npm start`/`pnpm` 启动类 → `start`；其余 `other`。分类在收集器内完成，供面板聚合（"install 总耗时"），注解本身保留原始 command。

### D6: dev-only 面板

`A2_ENABLE_GENERATION_TELEMETRY`（`app/a2/config.ts`，env 可覆盖，默认 `'false'`）。面板为浮动水滴图：每轮一条横向时间轴，分段着色（wait/stream/file/shell/start/preview），中断事件以标记点呈现；数据源 = 内存中最近 20 轮 + 当前会话已加载消息的 telemetry 注解。入口与快捷键细节在实现时定（见 Open Questions）。

## Risks / Trade-offs

- [finalize 补存增加一次 PUT] → 每轮仅一次（流结束后），相对现有 50ms 采样 PUT 可忽略。
- [replay 与 fresh 数据混淆] → `source` 字段强制区分；replay 不落库；面板分列展示。
- [Preview 永不就绪导致轮次悬挂] → 30s 宽限期超时 finalize，记 `timeout`。
- [注解体积膨胀影响持久化] → 8KB 上限 + 字段裁剪策略（D3）。
- [HMR 丢失内存轮次] → 收集器状态按 bolt 惯例挂 `import.meta.hot?.data`。
- [采集点反噬性能] → tap 均为同步记录 `Date.now()`；聚合计算延迟到 finalize/面板渲染时。

## Migration Plan

纯增量变更：flag 默认关闭，面板不可见；注解为附加字段，旧客户端忽略未知注解类型（与 response-stats 上线方式一致）。回滚 = 关闭 flag；已落库注解无需清理。

## Open Questions

- 面板入口形态（快捷键 / URL 参数 `?telemetry=1` / 设置项）——不影响 schema 与任务拆分，实现时定。
- 是否在面板中叠加展示服务端 usage 注解的 token 速率——可作为面板增强，不阻塞本次。
