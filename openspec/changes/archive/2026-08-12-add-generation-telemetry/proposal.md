# Proposal: add-generation-telemetry

## Why

项目生成与修改耗时较长、偶发长时间生成或中断，增量修改后 Preview 出现运行错误且恢复不稳定。现有可观测性（WB-09）只覆盖"请求 → LLM 流结束"这一段；**流结束之后到 Preview 可用之间的整段链路完全是黑盒**——动作执行（file/shell/start）、npm install 耗时、start 到 Preview 端口就绪、页面重载时的历史动作重放成本，均无任何测量。没有分段数据，后续优化方向（减少模型输出量 vs 动作运行时加固 vs 恢复去重放化）只能凭猜测。先建立测量，用数据决定优化优先级（关联用户故事 WB-01 聊天式生成、WB-02 实时预览、WB-09 响应可观测性）。

## What Changes

- **动作级计时**：`ActionRunner` 为每个动作记录 `{ type, command, startedAt, endedAt, status, exitCode }`，并区分 `fresh`（实时生成）与 `replay`（页面重载后重放历史）两种来源。
- **Preview 就绪配对**：以 `PreviewsStore` 的端口 `open` 事件为信号，与 start 动作配对，得出 start→preview 延迟。
- **端到端指标**：每轮生成记录用户发送 → 首 token → 流结束 → 动作尾巴结束 → Preview 可用的完整时间轴（waterfall），而非简单求和（文件动作与流重叠、动作串行执行）。
- **中断事件留痕**：记录 LLM 请求错误、用户 abort、续写段数上限触发的中断、以及流结束时未闭合 artifact 的检测信号。
- **遥测注解持久化**：每轮生成汇总为一条 `telemetry` 消息注解挂在助手消息上，随现有消息持久化通道落库（向后兼容的附加字段）。
- **采集恒开、呈现 dev-only**：采集层开销近零、所有环境生效；水滴图面板由 `A2_ENABLE_GENERATION_TELEMETRY` 开关（遵循 `app/a2/config.ts` 的 `A2_ENABLE_*` 惯例，env 可覆盖）控制，默认关闭，终端用户不可见。
- UI 文案使用中文（遵循项目 UI 语言约定）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workbench`: 新增生成链路遥测需求——每轮生成须采集动作级计时与端到端时间轴，中断事件须留痕，遥测数据须随消息持久化；呈现面板默认关闭。

## Scope Boundaries & Non-Goals

- **In scope**: 客户端采集（动作/Preview/中断/重放）、遥测注解持久化、dev-only 水滴图面板。
- **Non-goals**:
  - 不改变任何生成/执行逻辑本身——本次只测量，不做性能优化（优化是后续独立变更，用本次数据定优先级）。
  - 服务端遥测聚合表 / 跨项目统计——后续独立变更，本次注解数据可为其奠基。
  - 面向终端用户的耗时展示——如需可从遥测注解取数，另立变更。
  - 网关侧（`api.llm`）延迟埋点——LLM 流时间段沿用 WB-09 已有的服务端权威计时。
  - 历史消息回填遥测——仅对新产生的轮次生效。

## Impact

- **受影响代码**:
  - `workbench/app/lib/runtime/action-runner.ts` — 动作计时插桩、fresh/replay 标记
  - `workbench/app/lib/stores/previews.ts` — 端口 open 时间戳记录
  - `workbench/app/lib/webcontainer/index.ts` — WebContainer boot 耗时
  - `workbench/app/lib/runtime/message-parser.ts` — 未闭合 artifact 检测（仅上报信号，不改变解析行为）
  - 新增客户端遥测收集器（nanostores store，归入 `app/a2/` 或 `app/lib/stores/`，design 决定）
  - `workbench/app/components/chat/Chat.client.tsx` — 轮次生命周期边界、注解汇总与呈现入口
  - `workbench/app/a2/config.ts` — `A2_ENABLE_GENERATION_TELEMETRY` 开关
- **API**: 无路由变更；消息注解新增 `telemetry` 类型 payload（客户端按可选字段处理，向后兼容）。
- **依赖**: 无新增依赖。
- **数据**: 消息注解体积小幅增加；无 schema 变更。
