# Tasks: Add Multi-Agent Team (TL + PD + Engineer)

规则约束：每个任务 ≤2h，可独立验证。实施时严格遵守 design D11 的三个挂载点坑位。

## 1. 基础设施

- [x] 1.1 `a2/config.ts` 新增 `A2_ENABLE_MULTI_AGENT_MODE` flag（默认 false）与
  `isMultiAgentModeEnabled()`（localStorage `a2-multi-agent-mode` on/off 覆盖）；
  `vite.config.ts` `envPrefix` 白名单加入该 flag；验证 flag 关闭时 UI 与行为零变化
- [x] 1.2 编写 PD planner system prompt（产品经理人设：`<selection>` + `<plan>` 两段
  格式，4-6 条产品语言步骤，禁止技术细节；并入模板选择 few-shot 改写为产品语言）、
  PD 增量规划 prompt 变体（无 `<selection>` 段，项目上下文注入槽位）与分诊 prompt
  （输入消息 + 项目简况，输出固定 trivial/major），与 agent-mode cookie key 常量

## 2. 服务端：/api/plan 端点（PD）

- [x] 2.1 新建 `app/routes/api.plan.ts`：session 鉴权（401 拒绝）、PD prompt 注入、
  走 `dashScopeStreamText`/默认模型，返回 data-stream SSE；支持
  `mode: 'first' | 'incremental'`（增量模式注入项目上下文，D14）；手工验证流式
  输出与鉴权
- [x] 2.2 PD 输出解析器（`<selection>`/`<plan>` 两段独立容错 regex，增量模式
  selection 可选）+ 单元测试，覆盖格式漂移与部分缺失场景
- [x] 2.3 `/api/llmcall` 扩展可选 system prompt 参数（供分诊非流式调用），
  缺省行为不变

## 3. 客户端：规划流与闸门 UI

- [x] 3.1 二态模式开关 pill（单智能体/多智能体，默认单，ghost/accent 态，Tooltip），
  挂载 `BaseChat.tsx` 发送按钮左侧、**对话全生命周期常驻**、编排活跃期禁用
  （Tooltip"编排进行中，终止后可切换"），cookie 持久化
- [x] 3.2 规划流客户端（`usePdPlan`）：调用 `/api/plan`、流式解析步骤、丢弃
  reasoning、渲染"PD 正在规划…"与逐条步骤、timing 记录（startedAt/firstTokenAt/
  endedAt）、提供"跳过直接生成"（仅用户可按）
- [x] 3.3 计划审查卡片（`AgentPlanPanel`）：永远硬闸门（批准/编辑/重新规划/跳过），
  无自动放行；编辑纯本地；重新规划携带反馈重调 `/api/plan`
- [x] 3.4 `requestStatus` 状态机扩展 `planning` / `plan_proposed` 两态，
  ResponseStats 状态文案适配
- [x] 3.5 迭代分诊客户端：多智能体迭代消息先经分诊调用（带超时）；结论短暂展示
  且可一键推翻（major→直接生成 / trivial→先规划，D13）；失败/超时降级直通 + 提示

## 4. TL 编排器

- [x] 4.1 `useTlOrchestrator` hook：状态机（idle/planning/gate/executing/settling/
  paused/completed/terminated）、步骤状态列表、对外接口
  （start/approve/retryStep/skipStep/terminate/onRoundFinished/onRoundError）
- [x] 4.2 `buildStepInstruction(plan, i)` 纯函数（D10 模板）+ 单元测试
- [x] 4.3 步骤完成判定：`onFinish` + workbenchStore 动作状态订阅 + settle window
  （无 pending/running、无 failed 才推进）；失败信号（流错误/action failed）→ 暂停
- [x] 4.4 收尾消息：全部步骤终态后生成确定性汇总（含 完成/已跳过 列表），以
  `{type:'tl-wrapup', role:'tl'}` annotation assistant 消息入库

## 5. 流程集成

- [x] 5.1 `Chat.client.tsx` `sendMessage` 首次生成新增多智能体块（D11：独立挂载、
  `_input` 判定、规划期不预插用户消息）；规划失败降级回现有路径 + toast
- [x] 5.2 批准交接（approvePlan）：构建 D4 消息序列（用户 prompt + 计划消息
  `{role:'pd', steps, selection, timing}` annotation + 模板 artifact + 步骤 1 隐藏
  指令）`setMessages + reload()`；后续步骤轮由编排器 `append` 隐藏指令驱动
- [x] 5.3 失败处置与逃生：暂停态 重试/跳过/终止 按钮接线；现有 Stop 按钮在编排期
  终止编排；"跳过计划"回退单智能体路径
- [x] 5.4 `TlProgressPanel` 组件：步骤状态列表 + TL 阶段文案行 + 处置按钮，
  挂载到聊天区；模板 `getTemplates` 批准后才拉取（D7，403/429 限流文案）
- [x] 5.5 项目上下文采集器（工作区文件树截断 + 当前生效计划及每步完成态）+
  `sendMessage` 迭代分支接线（D11-4）：分诊判 major → 增量 `/api/plan` → 复用
  闸门与 TL（增量计划不拉模板）
- [x] 5.6 计划活文档：plan annotation 加 `gen` 版本号，新批准的增量计划取代生效
  计划，历史计划消息保留；编排终态回写步骤完成态（D15）

## 6. 观测

- [x] 6.1 telemetry 扩展：`phase: 'plan' | 'exec'` + 执行轮 `step` 序号；
  `recordPlanRound`（无动作 round 立即 finalize，setTimeout 0 延迟防 persist 竞态）；
  面板/ResponseStats 按 phase + step 分行展示

## 7. 测试

- [x] 7.1 e2e fixtures：`/api/plan` stub（selection+plan 两段）；`/api/chat` 多轮
  stub（按请求计数返回不同步骤 artifact）
- [x] 7.2 e2e 团队流：硬闸门→批准→逐步骤多轮推进→收尾汇总；步骤失败→暂停→
  重试/跳过/终止；PD 失败降级；跳过计划直接生成
- [x] 7.3 回归验证：flag 关闭 + 单智能体模式跑通现有全部 e2e，确认零行为变化
- [x] 7.4 生命周期 e2e：小改动迭代直通 / 大改动进增量规划 + 闸门 + 逐步骤执行；
  分诊推翻；分诊失败降级直通；单智能体模式无分诊
