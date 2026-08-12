# Design: replay-snapshot-cache

## Context

回放 ~17s 中 `npm install` 占 12.5s（perf-report P0 #2，见 proposal.md - Why）。POC（分支 `poc/nm-snapshot-cache`，commits `3dd0b0d` / `aae29de`）在 `@webcontainer/api@1.3.0-internal.10` 上完整验证了「serialize → OPFS → 全新 boot → mount → 起 dev server」的往返，实测缓存命中回放 ~7.1s。本设计把 POC 结论固化为实现约束：

1. **zip 格式不可用**：`internal.serialize` 输出标准 ZIP，运行时核心期望自定义 rawindex 格式 → `EIO: invalid type: integer 80, expected struct rawindexentry`。msgpack 被 serialize 拒绝（EINVAL）。**只有 json 格式可往返**。
2. **mountPoint 不落地**：`mount(bytes, { mountPoint })` 返回成功但文件系统上没有数据。**必须用整根快照（`serialize('.')`）+ 无 mountPoint 挂载**。
3. **符号链接可以保留**：根快照挂载后 `node_modules/.bin` 完整（12/12）——运行时内部往返携带链接信息，虽然客户端树格式表达不了。
4. **执行位丢失**：还原后 `vite` 报 EACCES，`chmod 755 node_modules/.bin/*` 修复（容器内有 chmod；无 find/readlink/wc）。
5. 写回成本：serialize 0.7s + OPFS 写 0.3s；快照体积 63.5MB（vite+react 模板，json 未压缩）。

## Goals / Non-Goals

**Goals:**

- 回放命中缓存时跳过 install：17s → ~7s，刷新/关 tab 重开/跨会话均覆盖（OPFS 磁盘级持久）。
- 任何失败路径无感回退完整重放，正确性零损失。
- 不引入服务端改动与网络请求。

**Non-Goals:**

- 不解决跨设备共享（CDN/服务端分发另议）。
- 不升级 `@webcontainer/api`（1.6.4 的 `fs.export`/SymlinkNode 是更干净的长期路径，但 internal 构建 pin 的原因未评估，风险另立变更）。
- 不优化首次生成轮与 dev server 冷启动（perf-report 其余 P0 项）。

## Decisions

### D1: 存储 — OPFS 存快照 blob，IndexedDB 存元数据

- **选 OPFS**：60MB+ 二进制 blob 的磁盘级存储，读写不经结构化克隆；IndexedDB 存大 blob 性能差且占配额方式不同。
- **元数据（key、size、createdAt、lastUsedAt）放 IndexedDB**（库名 `a2-nm-cache`，单 object store）：LRU 更新频繁，OPFS 里维护 manifest 文件需要整体读写，不划算。
- 备选（否决）：服务端 fileSnapshot 通道（2MB 上限 + DB/网络成本）；纯 IndexedDB。

### D2: 快照范围与格式 — `serialize('.')` json 整根快照

- POC 约束 1/2 决定了这是唯一可工作的组合。
- 整根快照包含源码：回放时第 1 轮的文件 action 全部跳过（快照已含），**后续轮次的文件 action 照常执行并覆盖**——天然满足「快照后编辑保留」（WB-15 Scenario: Post-snapshot edits are preserved）。
- 体积风险见 Risks。

### D3: 缓存 key — `sha256(package.json 内容)`

- 产物不含 lockfile（全库 57 条 install 均为裸 `npm install`），依赖唯一事实源是 package.json。
- key 只用内容哈希、不含项目 id：**相同依赖的多个项目共享同一份快照**（去重红利）；依赖一变即失效。
- 元数据条目：`{ key, sizeBytes, createdAt, lastUsedAt }`。

### D4: 写回时机 — install exit 0 且预览打开之后

- 触发点：install action 成功（exitCode 0）+ 该轮 preview 配对成功（`previewPortChanged`）后异步执行；key 已存在则跳过（幂等去重）。
- 不在用户感知路径（serialize 在 WebContainer 运行时侧执行，0.7s 量级）。
- 写回后立即做 LRU 检查（D6）。

### D5: 回放还原流程 — 乐观还原 + 失败补装

回放进入 action 执行前（WebContainer boot 完成后）：

1. 取第 1 轮（bootstrap 轮）action 队列中 `package.json` 文件内容 → sha256 → 查 IndexedDB。
2. 未命中 → 完整重放（现状路径），结束。
3. 命中 → 读 OPFS blob → `mount(bytes)`（无 mountPoint）→ `chmod 755 node_modules/.bin/*`。
4. 还原体检：`readdir('node_modules/.bin')` 非空且 `package.json` 可读。体检失败 → 走完整重放（此时 FS 已被污染，但后续完整重放的文件写入 + install 会覆盖重建——mount 是合并语义，install 重新链接）。
5. 体检通过 → 跳过第 1 轮的全部 file action 与 install action，其余 action（含 start）照常；后续轮次 action 全部照常。
6. **dev server 启动失败恢复**：若 start action 在还原后失败，补执行被跳过的 install 命令后重试 start（正确性兜底，不需 teardown）。

备选（否决）：悲观验证后再跳过（无法可靠预检 dev server 可启动性）；teardown 重来（WebContainer 单实例 + boot 成本高）。

### D6: 治理 — LRU 200MB 上限

- 每次写回后核算总占用，超 200MB 按 lastUsedAt 升序淘汰。
- 单快照体积上限 150MB（超限放弃缓存该次，走冷装）——防御异常大 node_modules 打爆配额。
- OPFS 配额错误（QuotaExceeded）捕获后仅放弃写回，不影响主流程。

### D7: 遥测适配

- 回放 bootstrap 轮新增 `restore: { hit: boolean, durationMs?: number, fallback?: 'none' | 'mount-failed' | 'start-failed' }`。
- 命中轮无 install action：B3 修复后的 settle 逻辑已兼容（有 start 证据即正常推进），无需改状态机。
- 采样脚本（sample-telemetry.mjs）的 replay finalized 判定不受影响。

### D8: 开关

- 遵循项目 feature-flag 约定：`app/a2/config.ts` 增 dev 开关（默认开），localStorage 覆盖键作为线上紧急回退（无需发版）。

## Risks / Trade-offs

- [依赖 `@unstableInternal` 的 `internal.serialize`，版本升级可能破坏] → try/catch 全程包裹 + 功能开关一键回退 + 在 pin 版本变更时重跑 POC 驱动脚本（`scripts/poc-nm-snapshot.mjs`）回归。
- [json 未压缩体积随项目增大（小模板已 63.5MB）] → 单快照 150MB 上限 + LRU 200MB；实现期用真实生成项目实测体积并决定是否收紧。
- [快照与「第 1 轮文件」之外的隐性状态不同步（如 .env、npm 版本差异产生的布局差异）] → 失败兜底链（体检失败走完整重放；start 失败补装重试）保证正确性，仅损失加速收益。
- [mount 合并语义未完全验证] → 实现任务里先做「根快照 + 覆盖写文件」的最小验证（复用 POC 路由扩展），再集成主链路。
- [多 tab 并发写同一 key] → 内容幂等（同 key 同内容），后写覆盖无副作用；LRU 元数据以 last-write 为准，可接受。
- [POC 的 fetch 验证打到宿主 5173（端口同名）] → 产品侧预览走 WebContainer 预览通道，不受影响；验证以 server-ready + 预览 iframe 为准。

## Migration Plan

1. 功能开关默认开（dev 先行），采样脚本回放一轮对比 restore 命中遥测与耗时。
2. 线上灰度即默认开（纯客户端能力，无服务端依赖），localStorage 覆盖键应急回退。
3. 回滚：关闭开关即回到完整重放，缓存数据留存不碍事（LRU 自然淘汰）。

## Open Questions

- 真实（更复杂的）生成项目快照体积分布——实现期用采样脚本实测，必要时调整 150MB/200MB 阈值（不改 spec）。
- OPFS 在 Cloudflare Pages 生产域（cross-origin isolated）下的配额表现——dev 与 staging 各实测一次（不改 spec）。

## Appendix: POC 结论归档（分支 `poc/nm-snapshot-cache`，commits 3dd0b0d / aae29de）

POC 于独立分支验证后未合入 dev（POC 路由 `app/routes/a2-poc-nm-snapshot.tsx` 与驱动脚本 `scripts/poc-nm-snapshot.mjs` 仅存在于该分支，dev 上无需清理）。结论：

1. PASS：还原后 vite dev server 正常启动，预览可访问；重放 ~7.1s vs 完整重放 ~17s。
2. 仅 `serialize('.', {format:'json'})` 可往返；zip → rawindexentry EIO，msgpack → EINVAL。
3. 带 mountPoint 的 mount 不落盘；必须根快照无 mountPoint 挂载。
4. symlinks survive（.bin 12/12），但 exec bit 丢失 → `chmod 755 node_modules/.bin/*` 修复。
5. `serialize` 位于 `wc.internal`（非 `wc.fs`），且调用需保持 receiver 绑定。

## Appendix: 实现期实测（2026-08-12，sample-telemetry.mjs 真实 LLM 项目）

- 快照体积：Vite+React Todo 项目 59.6MB（json 未压缩，<150MB 阈值，维持现阈值）。
- 命中回放：restore 1.4s，install SKIPPED，replay→preview 8.9s。
- 冷回放：install 18.5s，replay→preview ~18.7s。加速 ~10s（与设计预期一致）。
- 写回幂等：同一 key 重复触发仅落盘一次。

