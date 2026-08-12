# A2 生成链路性能遥测报告与优化方案

- 日期：2026-08-11
- 变更：`openspec/changes/add-generation-telemetry`（任务 7.1 实测数据）
- 环境：Windows 23H2 本机 dev（`npm run dev`，`A2_ENABLE_GENERATION_TELEMETRY=true`），
  LLM 网关 `/api/llm`（Bailian，`qwen3.8-max`），Prisma/SQLite，WebContainer 浏览器运行时
- 采样方式：Playwright 无头采样脚本 `workbench/scripts/sample-telemetry.mjs`
  （注册新账号 → 新建项目 → 增量修改 → 刷新回放），累计 8 轮 fresh 采样（7 轮有完整 TTFT 数据）+ replay 轮；
  DB 侧验证脚本 `workbench/scripts/dump-telemetry-db.mjs`、`db-check.mjs`、`probe-api.mjs`
- 产物位置：`%TEMP%\a2-telemetry-sample\`（sample-report.json / sample.log / db-dump.json / 截图）

---

## 1. 端到端时间线拆解（典型"新建"一轮）

以 run1 todo#1（服务器权威 usage 注解 + 客户端 telemetry 注解双份数据）为例：

```
发送 prompt
  │  waitMs（TTFT，含模型推理）        74,846 ms   ◀ 最大瓶颈
  ▼ 首 token
  │  streamMs（流式输出 6,981 tokens） 52,210 ms   ◀ ≈134 tok/s
  ▼ stream end
  │  tailMs（等 action 队列排空）      13,225 ms   ◀ npm install 主导
  ▼ finalize
其中 action 队列内部（串行）：
  file×5      2,308 / 695 / 1,569 / 995 / 23,208* / 20,316* ms（*被排队放大）
  npm install 13,572 ms
  npm run dev 常驻（start）
WebContainer boot：1,111 ms（页面加载时一次性）
start → preview 可见：2,623 ~ 3,760 ms（成功配对的轮次）
```

**结论先行：一轮"从零新建"总时长约 2~2.5 分钟，其中 ~60% 是等模型首 token，
~25% 是流式输出，~10% 是 WebContainer 内 npm install；浏览器/框架侧开销均 <2s，不是瓶颈。**

## 2. 分阶段量化数据（多轮 fresh + replay 汇总）

### 2.1 TTFT（waitMs：发送 → 首可见 token）

| 轮次 | waitMs | 备注 |
|---|---|---|
| run1 todo#1 | **74,846** | 冷启动；服务器 `firstVisibleTokenAt-startedAt` 与客户端一致 |
| run5 todo#1 | 30,846 | |
| run5 todo#2 | 41,705 | |
| run5 stopwatch#1 | 32,021 | 同账号另有一次 **~120s TTFB 离群值** |
| run5 stopwatch#2 | 12,147 | |
| run6 todo#1 | 6,691 | 网关热态下限 |
| run6 todo#2 | 34,623 | |

范围 **6.7s ~ 75s，离群 120s**。同一模型、同一网络下波动 10 倍以上，
说明 TTFT 主要取决于上游推理排队/思考时长，而非本地链路。

### 2.2 流式输出（streamMs）

- 范围 **17s ~ 52s**；run1 完整数据：52.2s 输出 6,981 completion tokens ≈ **134 tok/s**，速率稳定。
- promptTokens 3,707、total 10,688（单轮），上下文尚小，不是当前瓶颈。

### 2.3 WebContainer 侧

| 指标 | 数值 | 说明 |
|---|---|---|
| webcontainerBootMs | 757 ~ 1,111 ms | 快，非瓶颈 |
| npm install（新建） | 13,572 / 14,918 / 15,057 / 17,844 ms | 每个新项目一次 |
| npm install（刷新回放） | 9,843 / 10,198 ms | **每次 reload 都重装**，回放总耗时几乎全被它占据 |
| start → preview | 2,623 ~ 3,760 ms | dev server 起跳到 iframe 可见 |
| tailMs（drain） | 38 ms（增量轮）/ 12,540 ~ 13,225 ms（新建轮） | 新建轮 ≈ npm install 时长 |

### 2.4 文件写入被 action 队列串行放大

- fresh 轮 file action 表观时长：0.9s ~ **23.2s**（如 23,208 / 20,316 ms）——实际是在队列里等
  前序 shell/流式解析，写本身很快。
- 增量轮（无排队压力）与 replay 轮实测：**11 ~ 134 ms / 44 ~ 217 ms**，即真实写盘成本。

### 2.5 持久化写放大（本次实测新发现）

- 流式期间客户端以 50ms 采样节流触发 `PUT /api/projects/:id`，实测 **约 20~30 次/秒**；
  一轮 26~52s 的流式产生 **数百次全量 PUT**（每次携带完整 messages JSON）。
- run6 实测：这些 PUT 在 slug 冲突后 **100% 返回 409 并持续到流结束**（详见 §4.5）。

## 3. 瓶颈排名（按对端到端时长的贡献）

| 排名 | 瓶颈 | 典型耗时 | 占比 | 可优化空间 |
|---|---|---|---|---|
| 1 | LLM TTFT（首 token 等待） | 6.7 ~ 75s（离群 120s） | ~50-65% | 中（网关/模型侧） |
| 2 | 流式输出总时长 | 17 ~ 52s | ~25-35% | 中（输出长度） |
| 3 | WebContainer npm install | 10 ~ 18s（replay 必重跑） | ~8-12% | **高** |
| 4 | action 队列串行 | file 表观放大 10~20s（与流式重叠） | 感知层面高 | 高 |
| 5 | tail drain / preview 配对 | 0 ~ 13s | <10% | 中 |
| — | WebContainer boot / 框架渲染 | <1.2s | <2% | 无需优化 |

## 4. 遥测与持久化自身暴露的问题（B1–B5）

采样过程中遥测系统自身暴露了 5 个实现缺陷，均已定位到代码：

### B1 含 `start` action 的 fresh 轮可能永远卡在 `stream-ended`
`proceedAfterDrain`（`workbench/app/a2/telemetry.ts` L167）要求 `runningActionCount === 0`，
而 `npm run dev`（classifyCommand='start'）常驻 running → drain 永不通过 → 30s preview 宽限
不可达 → 注解不落库。run5 的 todo#1/#2、stopwatch#1 均复现。
**修复**：drain 判定忽略 `commandClass === 'start'` 的长驻进程（它们不应阻塞收尾），
或在 stream-end 时无条件进入 preview 宽限窗口。

### B2 finalize 与 action 队列竞态：start 尚未开始就已收尾
run6 todo#1：npm install 结束触发 drain → 此刻 `start` action 还在队列里未记录 →
`hasStartAction === false` → 立即 finalize；随后 preview 打开时轮次已 finalized，
`previewPortChanged` 的 `activeRound()` 跳过 finalized 轮 → **preview 永远配不上对**（preview={}）。
**修复**：finalize 前额外确认 workbench action 队列为空（而不只是遥测记录里没有 running），
或把「有无 start」的判断推迟到宽限窗口结束时。

### B3 replay 轮在 actions 到达前就被 finalize
`useMessageParser.parseMessages` 先执行解析（action 在解析回调里执行）再对同一消息调
`streamEnd`；replay 轮被创建时 action 已跑完（tap 时无轮可归属）或尚在队列，
`streamEnd` 立即 finalize → replay 轮普遍只有 0~1 个 action、无 preview。
**修复**：replay 路径在解析开始前先 `startRound`（按消息 id），并给 `streamEnd` 传
`drain`（等 workbench 队列排空）再收尾。

### B4 最终历史保存丢失：消息被截断、注解缺失
所有受影响账号的 DB 中 assistant 内容仅 276~307 字符（首 token 快照），
`usage/telemetry` 注解全部缺失（仅 run1 早期账号成功落库一份，见 §5）。
直接原因是 B5 的 409 风暴：首个 PUT（尚无 urlId）成功后，之后所有携带 urlId 的
PUT 全部 409，流式期与收尾期的保存无一幸免。

### B5 urlId 全局唯一约束 × 客户端按"自己的项目"查重 → 409 永久打断保存（根因）
- `prisma/schema.prisma`：`urlId String @unique`（全局唯一）。
- LLM 对相同 prompt 生成确定性 artifact slug（如 `simple-vite-react-todo`），跨账号重复。
- 客户端 `getUrlId`（`workbench/app/a2/persistence/db.ts` L274）只查**本账号**项目列表，
  认为 slug 可用；PUT 到服务端触发 P2002 → 409 → 之后每次保存（含遥测注解持久化）全失败。
- 连带后果：地址栏显示 artifact slug（`/chat/simple-vite-react-todo`）但服务端 urlId 仍是
  `chat-xxx` → 直接访问地址栏 URL 404 → loader 重定向回首页（前几轮 replay 失败的根因）。
- run6 实测：`probe-api.mjs` 证明路由本身工作正常（GET/PUT 200、读回一致），
  排除服务端解析问题；slug 普查确认 `simple-vite-react-todo` 已被更早账号占用。

**修复（建议组合）**：
1. 服务端 PUT 对 P2002 自动降级：冲突时保留原 urlId 并成功保存 messages（urlId 与消息保存解耦）；
2. 或改复合唯一 `@@unique([userId, urlId])`，slug 按用户隔离；
3. 客户端保存管道串行化 + latest-wins 合流 + 失败重试（当前是 fire-and-forget 并发轰炸）；
4. `storeMessageHistory` 在 urlId 已确定后不要每帧都携带重写 urlId。

## 5. 成功落库的完整遥测样本（d3 证据）

账号 `perfoto4u5`，项目「中文深蓝色界面示例」assistant 消息（11,027 字符）同时含两条注解：

- `usage`（服务器权威）：completionTokens 6,981 / promptTokens 3,707 / total 10,688；
  `timing.startedAt → firstVisibleTokenAt = 74,846 ms`，`→ endedAt = 127,056 ms`。
- `telemetry`（客户端）：`phases = { waitMs: 74846, streamMs: 52210, tailMs: 13225 }`，
  7 条 action 记录（含 npm install 13,572ms、被排队放大的 23,208/20,316ms file 写），
  `webcontainerBootMs: 1111`。两份数据的 TTFT 完全一致，验证了设计 D2 的服务器对齐目标。

## 6. 性能优化方案

### P0（收益大、风险低，建议立即做）

1. **修复 B5/B4 持久化链**（见 §4）：保存是产品正确性问题，且当前每轮产生数百次无效 PUT，
   也是服务端无谓负载。附带收益：遥测注解从此可稳定落库，支撑后续数据驱动优化。
2. **replay 跳过 npm install**：reload 回放 10~18s 里 >90% 是重装依赖。
   方案：按 `package.json + lockfile` 内容哈希缓存 WebContainer 内 `node_modules`
   （持久化到 IndexedDB/OPFS 或随 fileSnapshot 恢复），命中即跳过 install，
   预计回放总时长 **从 ~15s 降到 ~3-4s**。
3. **流式期间预取依赖**：`package.json` 一经写出即并行启动 `npm install`
   （当前等 shell action 排到才跑），可与剩余流式输出重叠，预计新建轮节省 **5~12s**。

### P1（收益中等，需要网关/产品配合）

4. **降低感知 TTFT**：TTFT 是最大单项（6.7~75s）。
   - 透传模型思考/推理 token 或展示"正在思考"进度，把等待变成可见进展；
   - 网关侧对 `/api/llm` 做预热/连接复用，并对 >60s 的离群请求做超时重试（120s 离群值）。
5. **action 队列调度**：file 写互相独立，可与 install 并行（写文件不依赖 node_modules）；
   至少把「写文件」与「npm install」分道，消除 20s 级的表观放大，改善面板观感与 tailMs。
6. **控制输出长度**：streamMs 与输出 token 线性相关（134 tok/s）。对简单需求在系统提示里
   约束样板代码量/合并小文件，输出从 7k → 4k tokens 即省 ~22s。

### P2（锦上添花）

7. **保存节流升级**：把 50ms 采样全量 PUT 改为 500ms~1s 防抖 + 串行 latest-wins 队列，
   写次数降低一个数量级；`fileSnapshot` 维持现有 2s 节流即可。
8. **telemetry 面板/采集修正**（B1~B3）：保证 fresh/replay 轮都能拿到完整 phases、
   action 明细与 preview 配对，为后续回归提供可信基线。
9. **start→preview（2.6~3.8s）**：dev server 启动本身占比不大，可在 boot 完成前预热
   iframe 骨架，属体验级优化。

## 7. 复现与数据

```powershell
# 采样（dev 服务需带 A2_ENABLE_GENERATION_TELEMETRY=true）
cd workbench
node scripts/sample-telemetry.mjs          # 注册新账号跑 todo 项目（新建×2 + replay）
node scripts/db-check.mjs <username>       # urlId/消息长度普查
node scripts/dump-telemetry-db.mjs <username>  # 导出注解明细
node scripts/probe-api.mjs <username> <password>  # 路由级验证
```

关键证据文件：`%TEMP%\a2-telemetry-sample\sample-report.json`（run6 全量轮次快照）、
`sample.log`（含 409 风暴与 replay 时间线）、`db-dump.json`（perfoto4u5 完整注解）。
