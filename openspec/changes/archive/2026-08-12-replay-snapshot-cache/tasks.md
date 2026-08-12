# Tasks: replay-snapshot-cache

## 1. 缓存存储层（snapshot-cache 模块）

- [x] 1.1 新建 `workbench/app/lib/runtime/snapshot-cache.ts`：IndexedDB 元数据 store（`a2-nm-cache`，条目 `{key,sizeBytes,createdAt,lastUsedAt}`）+ OPFS 目录（`a2-nm-cache/`）blob 读写封装；单元测试覆盖元数据 CRUD 与 LRU 淘汰计算
- [x] 1.2 实现 `sha256(package.json 内容) → key` 与 `lookup/put/touch/evict` 接口：put 时单快照 >150MB 拒绝、总量 >200MB 按 lastUsedAt 升序淘汰、QuotaExceeded 静默放弃；用 Playwright 脚本在真实 OPFS 环境验证读写与淘汰
- [x] 1.3 在 `app/a2/config.ts` 增加 `nmSnapshotCache` dev 开关（默认开）+ localStorage 覆盖键（紧急回退），遵循现有 feature-flag 约定

## 2. 快照写回（install 成功后）

- [x] 2.1 在 action 执行链路（`action-runner.ts` 相邻处）挂接写回触发：install action exitCode 0 且该轮预览配对成功后，异步 `internal.serialize('.', {format:'json'})` → OPFS put（key 已存在则跳过）；全程 try/catch，失败仅告警不阻断
- [x] 2.2 用 POC 驱动脚本（扩展 `scripts/poc-nm-snapshot.mjs`）验证：生成一轮 → 刷新 → OPFS 中存在快照且元数据正确；重复触发幂等

## 3. 回放还原（跳过 install）

- [x] 3.1 先做「根快照 + 覆盖写文件」合并语义最小验证（复用 POC 路由）：mount 后 writeFile 覆盖同名文件、新增文件，确认最终 FS 与逐轮重放一致，再放开主链路集成
- [x] 3.2 回放入口集成还原流程（design D5 步骤 1–4）：boot 完成后取 bootstrap 轮 package.json → 查缓存 → 命中则 mount（无 mountPoint）+ `chmod 755 node_modules/.bin/*` + 体检（readdir `.bin` 非空、package.json 可读）
- [x] 3.3 命中时跳过 bootstrap 轮的 file/install action、其余 action 照常；后续轮次 action 全照常（快照后编辑覆盖写入）；未命中/体检失败走完整重放
- [x] 3.4 start action 失败恢复：还原后启动失败 → 补执行被跳过的 install 命令 → 重试 start；验证该路径最终成功且遥测记录 fallback='start-failed'

## 4. 遥测适配

- [x] 4.1 回放 bootstrap 轮遥测增加 `restore: {hit, durationMs, fallback}` 字段（telemetry.ts）；确认 B3 settle 逻辑兼容「命中轮无 install action」，补 `telemetry.spec.ts` 用例
- [x] 4.2 `sample-telemetry.mjs` 回放轮断言扩展：输出 restore 命中与回放耗时对比（命中 ~7s vs 冷 ~17s）

## 5. 端到端验证与收尾

- [x] 5.1 Playwright e2e（`tests/e2e/` 新增）：缓存命中回放跳过 install 且预览可用；依赖变更（改 package.json）走完整重放；清除缓存后冷装成功并重新写回
- [x] 5.2 用真实生成项目实测快照体积与回放耗时，记录到 perf-report；必要时收紧 150MB/200MB 阈值
- [x] 5.3 验证开关关闭时行为与现状完全一致（零差异回归）；归档 POC 分支结论（`poc/nm-snapshot-cache`）到变更文档并删除 POC 路由
