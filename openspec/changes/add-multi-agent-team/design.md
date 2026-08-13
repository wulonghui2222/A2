# Design: Multi-Agent Team (TL + PD + Engineer)

## Context

首次生成当前路径（`Chat.client.tsx` 的 `sendMessage`）：`chatStarted=false` 时正常走
`append()` 直通 `/api/chat` Bolt 流（本 fork 的 `autoSelectStarterTemplate` 默认 false，
带 `autoSelectTemplate` 条件的分支是死代码——上一轮实施已验证）。LLM 调用有两条路径：
平台默认模型走 `dashScopeStreamText`（自研 SSE 解析，保留 reasoning_content），BYOK 走
AI SDK `streamText`。需求与范围见 proposal.md。

本 change 引入三角色团队流水线：TL（统筹编排）+ PD（规划）+ Engineer（执行，即现有
Bolt 流）。与上一版（PD+Engineer）设计的关键差异：批准后不再是"一次性整批执行"，
而是由 TL 确定性编排器逐步骤驱动多轮生成，全程进度可见、失败即停。

## Goals / Non-Goals

**Goals:**
- 单智能体模式代码**零改动**：现有 Bolt 流原样保留，团队模式是纯增量路径
- 团队模式首次生成：TL 接单 → PD 规划轮（只读）→ 必审硬闸门 → TL 逐步骤驱动
  Engineer（每步一轮，轮间自动衔接）→ TL 收尾汇总
- **规划贯穿项目全生命周期**：迭代消息先经 AI 分诊（小改动直通 / 大改动进 PD
  增量规划），增量计划同样经必审闸门 + TL 逐步骤执行；计划成为随项目演进的活文档
- 规划/闸门全流程可降级、可逃生；执行失败立即暂停转人工，任何失败不阻塞用户
- 全部行为 flag-gated，flag 关闭时代码路径与现状逐字节等价

**Non-Goals:**
- TL 不做 LLM 调用与语义验收（完成判定 = 流结束 + 动作成功，见 D9）
- 不做自动重试、自动纠错循环、动作级计划解析、代码级偏离检测
- 不动 `/api/chat`、message-parser、`ActionRunner`；单智能体迭代路径零改动
  （单智能体下不发生分诊）
- 编排不做跨会话恢复（内存态）

## Decisions

### D1: 双模式平级并存，单智能体代码零改动

团队模式不重构、不抽象现有生成路径：`sendMessage` 首次生成处新增一条并列路径
（flag 开 + 模式=多智能体时进入），其余代码逐字节不动。降级复用这一点——规划失败
即回落到原路径，无需"恢复"逻辑。

### D2: PD 规划吞掉模板选择，两段结构输出，产品语言

PD 输出顺序：`<selection>`（templateName + title）→ `<plan><step>…</step>…</plan>`
（4-6 条）。PD 采用产品经理人设：步骤用产品语言描述"做什么"，不含文件名、框架名等
技术细节——技术选型是 Engineer 的职责。产品语言让用户真正审得动；代价是计划与
技术执行的对应关系变松，计划定位是"需求清单"，步骤指令（D10）作为执行轮的上下文
边界而非精确蓝图。

- **备选**：先模板选择、后规划。否决：多一次前置往返；模板选型本质是规划的一部分。

### D3: 新流式端点 `POST /api/plan`，不复用 `/api/llmcall`

`/api/llmcall` 是非流式端点，无法支撑"计划逐条流式渲染"。`/api/plan` 复用
`dashScopeStreamText` / 网关注入密钥 / session 鉴权（同 `api.chat.ts` 的
`getSessionUser` 模式），返回 AI SDK data-stream 格式 SSE，客户端用与 useChat
相同的 wire 解析。规划轮的 reasoning annotation 由客户端丢弃不渲染（MA-01）。
端点只产出文本、不触碰工作区——结构性只读隔离。

### D4: 计划持久化 = assistant 消息 + `plan` annotation；执行注入 = 隐藏 user 消息

批准后消息序列（第一步）：`[user 原始 prompt, assistant 计划消息(annotation:
{type:'plan', role:'pd', steps, selection, timing}), （可选）模板导入 artifact]`
→ `setMessages`，随后与后续步骤轮一样走 `append()` 追加隐藏指令消息（D10）进入
第一步执行轮。注意不能用 `reload()`：ai-SDK v4 的 reload 会从请求中剔除末尾的
user 消息，隐藏的步骤 1 指令永远发不出去。计划走现有消息持久化
通道，刷新后可恢复；`role` 标记持久化预留，v1 UI 仅文案层面体现角色。

### D5: 必审硬闸门，唯一出口是用户按"跳过"

计划产出后**永远硬闸门**（批准 / 编辑 / 重新规划 / 跳过）。无软闸门、无倒计时、
无 AI 自动放行。"跳过"是用户知情放弃审查，作为逃生通道保留（MA-03 / MA-05）。

### D6: 二态模式开关 pill，挂载在发送按钮左侧

`BaseChat.tsx` 底部 `flex justify-end` 行内、`SendButton` 之前插入 pill：
**单智能体（默认，ghost 态）/ 多智能体（accent 填充）**，Tooltip 说明。**对话全
生命周期常驻**（首次生成前与迭代阶段均可见，决定每条消息走哪条路径）；TL 编排
活跃期可见但禁用，Tooltip 提示"编排进行中，终止后可切换"。状态存 cookie。整体由 `a2/config.ts` 新增
`A2_ENABLE_MULTI_AGENT_MODE`（默认 false）控制，并同步加入 `vite.config.ts`
`envPrefix` 白名单（否则 env 不注入 `import.meta.env`）；另提供
`isMultiAgentModeEnabled()`：localStorage key `a2-multi-agent-mode`（"on"/"off"）
运行时覆盖 env flag，便于 e2e 在共享 dev server 启用。

### D7: 模板 GitHub 拉取推迟到批准之后

PD 已给出 selection，批准后才调 `getTemplates`——拉取耗时被用户阅读/决策时间吸收。
拉取失败降级 blank 模板不阻塞（沿用现有 catch toast，403/429 按限流文案处理）。

### D8: Telemetry 与 requestStatus 扩展

- `requestStatus` 新增 `planning` / `plan_proposed` 两态，探测模式与现有
  reasoning→thinking 的 useEffect 相同
- timing annotation 增加 `phase: 'plan' | 'exec'` 与执行轮 `step` 序号字段；
  规划轮通过无动作 round 立即 finalize 持久化（`recordPlanRound` 模式，
  setTimeout 0 延迟等待消息提交后再记录，避免 persist 读到旧 messagesRef）
- ResponseStats/面板按 phase + step 分行展示

### D9: TL = 客户端确定性状态机（`useTlOrchestrator`），完成判定 = 流结束 + 动作落地

TL v1 **不做任何 LLM 调用**：它是纯客户端编排 hook，状态机：
`idle → planning → gate → executing(step i) → settling → executing(i+1) → … →
completed`，分支 `paused(step i failed)` 与 `terminated`。

**步骤完成判定（TL-02）**：两个信号都满足才推进——
1. `onFinish`（useChat 回调，流结束）
2. 动作落地：订阅 workbenchStore 的动作执行状态，当前轮所有 action 无 pending/
   running 且无 failed，配合短 settle window（沿用 replay 的等待经验：对
   start/install 类命令要有证据再判定）

**失败判定（TL-04）**：`onError`（流错误）或任一 action 状态 failed → 立即 `paused`，
面板展示 重试/跳过/终止 三个仅用户可按的动作；无自动重试。

- **备选 A**：TL 是 LLM Agent（每步完成后语义验收）。否决：判断不可靠、成本翻倍、
  v1 不需要；保留为演进方向（验收型 TL 可后续单独立 change）。
- **备选 B**：整批生成 + 事后核对。否决：用户已明确选"每步独立一轮"。
- **已知边界**：模型可能"声称完成但没做"，确定性判定发现不了语义漏项——v1 接受，
  验收能力留给演进。

### D10: 步骤指令 = 隐藏 user 消息，模板化构造

每轮步骤指令（隐藏 user 消息，`[Model][Provider]` 前缀沿用现有格式）：
```
已批准的计划（共 N 步）：
1. …（完成态标记：✓ 已完成 / ▶ 当前 / 待执行）
…
当前执行步骤 i：<step 文本>
要求：仅完成当前步骤；不要提前实现后续步骤；基于当前项目已有代码继续。
```
指令构造是纯函数（`buildStepInstruction(plan, i)`），可单测。

### D11: 集成挂载点（吸收上一轮实施的三个坑）

1. 多智能体块**独立挂载**在 `runAnimation()` 之后，条件
   `!chatStarted && _input.length > 0 && isMultiAgentModeEnabled() &&
   agentMode === 'multi'`，不依赖 `autoSelectStarterTemplate`（本 fork 默认 false，
   相关分支是死代码）
2. `BaseChat` 调 `handleSendMessage?.(event)` 不带第二参——`sendMessage` 内
   `messageInput` 为 undefined，必须用 `_input = messageInput || input`
3. 规划期间**不预插用户消息**（避免降级回 append 路径时重复）；批准后由编排入口
   一次性构建 D4 序列
4. 迭代分诊分支挂载在 `sendMessage` 的迭代路径（`chatStarted`）之前：条件
   `chatStarted && isMultiAgentModeEnabled() && agentMode === 'multi'` 才进分诊；
   其余情况（单智能体 / flag 关）逐字节走原迭代路径

### D12: 进度面板与收尾消息

- `TlProgressPanel`：步骤列表（✓/▶/✗/待执行 状态）+ TL 阶段文案行
  （"TL：正在调度 PD 规划…"/"TL：正在推进步骤 2/5…"）+ 暂停时的三个处置按钮。
  挂载在聊天区（计划卡片下方/workbench 侧栏二选一，实施时按布局定），编排活跃期
  常驻，完成后保留最终态
- 收尾消息（TL-05）：确定性模板文本（计划 + 每步 完成/已跳过 列表），以带
  `{type:'tl-wrapup', role:'tl'}` annotation 的 assistant 消息入库，随消息持久化
- 现有 Stop 按钮在编排期语义 = 终止编排（TL-06）：`abort()` 时同步调
  orchestrator 的终止入口

### D13: 迭代 AI 分诊 = 轻量非流式调用，只路由不放行

多智能体模式下每条迭代消息先经一次**非流式分诊调用**：复用 `/api/llmcall`
（扩展可选 system prompt 参数，缺省行为不变），注入分诊 prompt（输入 = 用户新
消息 + 项目简况，输出固定 `trivial` / `major` 二选一）。秒级完成；**失败或超时
一律降级直通**（保守：宁可漏规划，不阻塞用户）。分诊只决定"是否进规划流"，
一旦进入，硬闸门语义与首次生成完全一致（MA-03 必审，无 AI 放行）。

**结果可见且可推翻**：分诊结论短暂展示（如"判断为小改动，将直接生成"），
附一键推翻入口——major 可强制直通（"直接生成"）、trivial 可强制进规划
（"先规划"）。

- **备选**：用户手动触发"先规划"。保留为推翻入口的一部分；纯手动依赖用户判断
  改动大小，漏判大改动时直通翻车。
- **备选**：每次都规划。否决：小改动体验过重（用户已确认分诊方案）。

### D14: PD 增量规划 = 同端点 `mode: 'incremental'` + 项目上下文注入

`/api/plan` 接受 `mode: 'first' | 'incremental'`。增量模式请求体携带项目上下文：
**工作区文件树**（workbenchStore 采集，深度/数量截断）+ **当前生效计划及每步
完成态**（从最新 plan annotation 提取）+ 用户新请求。PD 增量 prompt（D2 人设
不变）产出"在现有基础上做什么"的步骤，**无 `<selection>` 段**——解析器复用
D2 的两段容错解析，selection 置为可选。增量计划批准后**不做模板拉取**（D7 仅
首次生成适用），直接交 TL。

### D15: 计划活文档 = annotation 版本号 `gen`

计划 annotation 增加 `gen` 序号：首次批准的计划 `gen=1`；每次批准的增量计划
`gen+1` 并**取代当前生效计划**（TL 步骤指令、分诊上下文、完成态追踪均以最新
生效计划为准）。历史计划消息保留在对话中形成审计链，不做删除或合并。完成态
以编排器终态（完成/已跳过）回写 annotation。

## Risks / Trade-offs

- [N 步 = N 轮生成，总延迟与 token 成本约为整批模式的 N 倍] → 用户自选模式即接受
  交换；进度面板 + 随时 Stop 消化等待；后续可评估步骤合并（相邻小步并一轮）
- [动作 settle 判定误判（长命令/后台进程）] → settle window + 证据等待；判定保守：
  宁可多等，流结束且无错误且动作空闲才推进
- [上下文随轮次增长（计划 + 完成清单每轮注入）] → 计划仅 4-6 条短文本，增量可控；
  现有 contextOptimization 机制兜底
- [模型语义漏项无法被确定性判定发现] → v1 接受（Non-Goal）；验收型 TL 为演进方向
- [DashScope 规划输出格式漂移] → 两段独立容错解析；全失败降级直接生成，仅
  selection 失败降级 blank
- [分诊误判（大改动漏判直通 / 小改动被塞进重流程）] → 结论可见且一键推翻；
  失败/超时降级直通；误判成本不对称时偏向直通（不阻塞）
- [增量规划上下文膨胀（文件树 + 历史计划）] → 文件树截断 + 只带最新生效计划
  （不带全部历史 gen）；上下文超限风险与 D10 同策略控制
- [e2e 多轮 stub 复杂度] → `/api/chat` stub 按请求计数返回不同 artifact（每步一轮
  独立响应）；`/api/plan` stub 复用 dataStreamBody 模式

## Migration Plan

1. `A2_ENABLE_MULTI_AGENT_MODE` 默认 false 上线，生产行为零变化
2. 内部/dev 环境开启验证（配合 generation-telemetry 观察规划轮与逐步执行轮指标）
3. 确认后放开 flag；回滚 = 关 flag，无需回滚代码

## Open Questions

- PD 是否用与执行相同的默认模型，还是换更便宜/更快的模型——v1 先用同模型
  （分诊同理）
- 是否需要单步执行超时（长步骤保护）——v1 不做，用户可 Stop
- 步骤合并策略（相邻小步骤一轮完成以降低成本）——收集成本数据后再评估
