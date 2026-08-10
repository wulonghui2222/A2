## 1. API 层 — 返回 fileSnapshot

- [x] 1.1 在 `workbench/app/routes/api.projects.$id.ts` 的 GET loader 中，查询 Project 时 select `fileSnapshot` 字段，并在 response JSON 中包含 `fileSnapshot: project.fileSnapshot`

## 2. 持久化层 — 透传 fileSnapshot

- [x] 2.1 在 `workbench/app/a2/persistence/db.ts` 的 `ProjectDetail` 接口中增加 `fileSnapshot?: string | null` 字段
- [x] 2.2 在 `fetchDetail()` 返回值中透传 `fileSnapshot`，并在 `ChatHistoryItem`（`useChatHistory.ts`）中增加可选的 `fileSnapshot` 字段

## 3. 状态管理 — 快照恢复方法

- [x] 3.1 在 `workbench/app/lib/stores/workbench.ts` 的 `WorkbenchStore` 中新增 `restoreFiles(snapshot: Record<string, string>)` 异步方法：解析快照 JSON，先 mkdir 再并行 writeFile 到 WebContainer
- [x] 3.2 处理边界情况：snapshot 为空对象时直接返回；写入失败时 console.warn 但不抛错（不影响 Chat 渲染）

## 4. 组件层 — 加载时触发恢复

- [x] 4.1 在 `workbench/app/lib/persistence/useChatHistory.ts` 的 `getMessages` 回调中，收到 `storedMessages` 后检查 `fileSnapshot`，若存在则 `await workbenchStore.restoreFiles(JSON.parse(fileSnapshot))`，在 `setReady(true)` 之前完成

## 5. 验证

- [ ] 5.1 手动验证：打开一个有 fileSnapshot 的历史项目，确认 Files 面板显示文件树且编辑器可查看文件内容
- [ ] 5.2 手动验证：打开一个没有 fileSnapshot 的旧项目，确认不报错、Files 面板为空
- [ ] 5.3 手动验证：在恢复文件的历史项目中发送新消息，确认 AI 可以基于现有文件继续迭代
