## Context

当前数据流：项目保存时，`collectFileSnapshot()` 将 WebContainer 文件树序列化为 `{ relativePath: content }` JSON 并存入 `Project.fileSnapshot` 字段。但加载时 GET API 不返回此字段，客户端也没有恢复逻辑。See proposal.md — Why。

## Goals / Non-Goals

**Goals:**
- 打开历史项目时，Files 面板立即显示项目文件树
- 用户可以在编辑器中查看和编辑恢复的文件
- 恢复过程对用户透明，无需额外操作

**Non-Goals:**
- 不自动启动 dev server / 恢复 Preview（后续迭代）
- 不处理二进制文件的恢复（快照中已排除二进制文件）

## Decisions

### D1: 在 API 层直接返回 fileSnapshot

GET `/api/projects/:id` 在现有 response 中增加 `fileSnapshot` 字段（string | null）。不新增接口，复用现有请求，零额外网络开销。

**替代方案**：新增 `/api/projects/:id/snapshot` 端点 — 拒绝，因为会增加一次请求，且快照数据量通常在 100KB 以内。

### D2: 在 useChatHistory 中触发恢复，在 ready=true 之前完成

`useChatHistory` 的 `getMessages` 回调中，收到 `fileSnapshot` 后调用 `workbenchStore.restoreFiles(snapshot)`，写入 WebContainer。由于 FilesStore 的 watcher 会自动捕获文件变化，无需额外通知机制。

```
getMessages response
    │
    ├── messages → setInitialMessages()
    ├── fileSnapshot → workbenchStore.restoreFiles()
    │       │
    │       ▼
    │   for each file: webcontainer.fs.writeFile(path, content)
    │       │
    │       ▼
    │   FilesStore watcher detects → files map updated
    │
    └── setReady(true)
```

**替代方案**：在 Chat.client.tsx 的 useEffect 中恢复 — 拒绝，因为这会导致 Chat 先渲染空状态再更新，体验不好。

### D3: restoreFiles 方法放在 WorkbenchStore

新增 `restoreFiles(snapshot: Record<string, string>)` 方法，内部通过 WebContainer API 逐文件写入。先创建目录结构，再写文件。写入是并行的（Promise.all）以提升速度。

### D4: 快照为空时静默跳过

`fileSnapshot` 为 null 或解析为空对象时，不执行任何写入，Files 面板保持空白。不报错，不显示 toast。

## Risks / Trade-offs

- **[大文件写入耗时]** 快照可能包含几十上百个文件，WebContainer 写入是异步的。 → 并行写入 + 合理数量的文件（快照已有 2MB 硬限制），实际耗时可控。
- **[Preview 不可用]** 本次不恢复 Preview，用户打开历史项目后需要手动触发运行。 → 可以接受为第一阶段的改进，后续可加入自动 `npm install && npm run dev`。
- **[写入与 watcher 竞态]** FilesStore watcher 已初始化，写入会触发 add_file/change 事件。 → 这正是预期行为，watcher 更新 files map 后 UI 自动刷新。
