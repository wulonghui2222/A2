# Tasks: add-generation-telemetry

## 1. 基础：开关与收集器骨架

- [x] 1.1 在 `workbench/app/a2/config.ts` 新增 `A2_ENABLE_GENERATION_TELEMETRY`（env 可覆盖，默认 `'false'`），验证：构建无错，flag 值可被 env 覆盖
- [x] 1.2 新建 `workbench/app/a2/telemetry.ts`：遥测轮次类型定义（design D3 schema）、轮次状态机（D2）、nanostores 存储（保留最近 20 轮）、`import.meta.hot?.data` 挂载；验证：Vitest 单测覆盖轮次创建/推进/finalize 状态转换

## 2. 动作计时插桩

- [x] 2.1 `action-runner.ts` 在动作执行前后 tap 收集器，记录 `{ id, type, command?, startedAt, durationMs, status, exitCode? }`；shell 命令按 design D5 分类、截断 200 字符；验证：Vitest 单测覆盖三类动作的记录与命令分类
- [x] 2.2 fresh/replay 来源标记：`parseMessages` 路径在页面重载重放时以 `source: 'replay'` 开启轮次，实时流式为 `'fresh'`（经由 useMessageParser/workbench store 传递来源信号）；验证：单测断言两种来源的轮次标记互不覆盖

## 3. 生命周期与 Preview 配对

- [x] 3.1 `previews.ts` 在端口 `open` 事件记录时间戳并 tap 收集器；收集器将其与最近一次 start 动作配对得出 `startToPreviewMs`；验证：单测覆盖配对与无 start 动作场景
- [x] 3.2 `webcontainer/index.ts` 记录 WebContainer boot 耗时（`webcontainerBootMs`）；验证：dev 启动后可在收集器中读到该值
- [x] 3.3 轮次 finalize：流结束后等待动作链空闲（actionsDrained），有 start 动作则进入 30s preview 宽限期（超时记 `preview.timeout`），无则立即 finalize；验证：Vitest 单测覆盖正常完成/超时/无 start 三条路径

## 4. 中断事件留痕

- [x] 4.1 `message-parser.ts` 新增只读 `getOpenState(messageId)`（不改变解析行为）；收集器在流结束时读取并记录 `unclosed-artifact`；验证：Vitest 单测覆盖闭合/未闭合两种流结束状态
- [x] 4.2 `Chat.client.tsx` 在 `onError`、`abort()`、以及“流异常结束且无 usage 注解”（segment-limit 推断，design D4）处 tap 记录对应中断事件；验证：手工触发 abort 后轮次包含中断记录

## 5. 持久化

- [x] 5.1 finalize 时将 fresh 轮次写为 assistant 消息 `telemetry` 注解（version 字段、8KB 上限、超限丢弃 `actions[].command`，design D3），并显式补存一次 `storeMessageHistory`；replay 轮次不落库；验证：单测覆盖注解生成/超限裁剪/replay 跳过，且旧客户端忽略未知注解类型不报错

## 6. dev-only 面板

- [x] 6.1 新建水滴图面板组件：每轮一条横向时间轴，分段着色（wait/stream/file/shell/start/preview），中断标记点，fresh/replay 分列；仅在 `A2_ENABLE_GENERATION_TELEMETRY` 开启时渲染，中文文案；验证：flag 关闭时无任何渲染与入口，开启后可见
- [x] 6.2 面板数据源接线：内存轮次 + 当前会话已加载消息的 telemetry 注解；入口形态（快捷键/URL 参数/设置项）实现时定（design Open Question）；验证：重载历史项目后面板可同时展示持久化注解与 replay 轮次

## 7. 端到端验证

- [ ] 7.1 手工验证清单：①新项目生成一轮 → fresh 轮次含完整时间轴；②重载该项目 → replay 轮次单独标记且不覆盖原注解；③生成中 abort → 中断留痕且轮次正常 finalize；④生产构建默认无任何面板痕迹；随后跑 lint + typecheck + 既有单测
