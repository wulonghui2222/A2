# Proposal: replay-snapshot-cache

## Why

打开已有项目（回放）时用户要等 ~17s 才能看到预览，其中 `npm install` 占 12.5s（74%，perf-report P0 #2）；每次刷新/重开 tab，WebContainer 内存文件系统都从零重装依赖，而这些依赖内容在上一次成功安装后就已经确定。POC（分支 `poc/nm-snapshot-cache`，commit `aae29de`）已验证：安装成功后把整个工作区序列化为 JSON 快照存入 OPFS，回放时直接挂载还原 + 修复执行位，可跳过 install，把回放从 ~17s 降到 ~7s（关联用户故事 WB-02 实时预览、WB-05 迭代编辑、WB-11 生成本次遥测）。

## What Changes

- **快照写回**：任意一轮 `npm install` 成功且预览打开后，异步执行 `internal.serialize('.')`（JSON 格式）存入 OPFS，key 为 `package.json` 内容哈希；写回不在用户感知路径上（实测 serialize 0.7s + 写入 0.3s）。
- **回放还原**：打开已有项目时，若 OPFS 命中与当前 `package.json` 哈希匹配的快照，挂载根快照替代「文件重放 + npm install」；随后 `chmod 755 node_modules/.bin/*` 修复执行位，再按序执行后续 shell/start action。
- **增量文件叠加**：快照之后的轮次产生的文件改动在挂载后覆盖写入，保证回放结果与逐轮重放一致。
- **回退安全**：缓存未命中、哈希不匹配、挂载失败或还原后 dev server 启动失败时，自动回退现有完整重放路径，零损失。
- **缓存治理**：OPFS 占用 LRU 淘汰（上限 200MB）；提供清理入口（随缓存元数据维护，无独立 UI）。
- **遥测适配**：回放轮新增 restore 阶段埋点（命中/未命中、挂载耗时），settle 逻辑兼容「命中轮无 install action」的形态。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workbench`: 新增回放快照缓存需求（WB-15）——回放须在缓存命中时跳过依赖安装、以快照还原工作区，未命中或还原失败须无感回退完整重放，且回放结果与完整重放一致。

## Scope Boundaries & Non-Goals

- **In scope**: 客户端（浏览器 OPFS）快照缓存、回放路径改造、回退与遥测适配。
- **Non-goals**:
  - 跨设备/服务端快照分发（方案 C 依赖预打包/CDN）——后续独立变更。
  - `@webcontainer/api` 升级到 1.6.4（官方 `fs.export`/SymlinkNode）——当前 internal 构建下 JSON 根快照已满足需求，升级风险另议。
  - 首次生成（非回放）的 install 提速（install 与流式输出并行等）——perf-report 另一 P0 项。
  - dev server 冷启动（start→preview ~4s）优化——perf-report P0 #3。

## Impact

- **受影响代码**:
  - 新增 `workbench/app/lib/runtime/snapshot-cache.ts`（或同级模块）——OPFS 读写、serialize/mount 封装、哈希与 LRU
  - `workbench/app/lib/webcontainer/index.ts` — boot 后挂载入口
  - `workbench/app/lib/runtime/action-runner.ts` / workbench 回放编排 — install 跳过判定与增量文件叠加时序
  - `workbench/app/a2/telemetry.ts` — restore 阶段埋点
- **API**: 无服务端接口变更；不新增网络请求。
- **依赖**: 无新增依赖（使用现有 `@webcontainer/api@1.3.0-internal.10` 的 `internal.serialize` 与 `mount`）。
- **数据**: 浏览器 OPFS 新增 `a2-nm-cache/` 目录，LRU 上限 200MB；用户清除站点数据即失效（回退冷装）。
- **已知 POC 结论约束**（写入 design）：zip 格式不可用（运行时版本错配）、mountPoint 不落地（须根快照无 mountPoint 挂载）、执行位丢失须 chmod、容器内无 find/readlink。
