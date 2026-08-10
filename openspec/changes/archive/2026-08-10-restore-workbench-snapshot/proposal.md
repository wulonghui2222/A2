## Why

当用户从"我的项目"页面进入一个已完成的历史项目工作台（如 `/chat/personal-portfolio-site`）时，Files 面板和 Preview 面板都是空的。这是因为数据库虽然保存了 `fileSnapshot`（文件树快照），但 GET API 没有返回该字段，客户端也没有将快照恢复到 WebContainer 的逻辑。用户无法在历史项目中查看代码或继续迭代，严重影响了"我的项目"的使用价值。

## What Changes

- GET `/api/projects/:id` 接口 SHALL 在响应中包含 `fileSnapshot` 字段
- 客户端加载历史项目时，SHALL 将 `fileSnapshot` 中的文件写入 WebContainer 虚拟文件系统
- Files 面板 SHALL 通过现有的 WebContainer 文件监听机制自动感知恢复的文件
- 恢复过程 SHALL 在 Chat 组件渲染前完成（即用户打开历史项目时立即看到文件树）
- Preview 面板不在此次范围内自动启动 dev server（需要用户手动触发或后续迭代）

### Non-Goals

- 不自动安装依赖或启动 dev server（Preview 恢复）
- 不重新执行历史消息中的 shell actions
- 不修改文件快照的保存逻辑（已在 project-plaza 中实现）

## Capabilities

### New Capabilities

无新增独立 capability。

### Modified Capabilities

- `workbench`: 新增历史项目文件恢复行为 — 打开已有项目时，系统 SHALL 从服务端获取 `fileSnapshot` 并将文件写入 WebContainer，使 Files 面板显示项目文件内容

## Impact

- **API 层**: `workbench/app/routes/api.projects.$id.ts` — GET loader 需返回 `fileSnapshot`
- **持久化层**: `workbench/app/a2/persistence/db.ts` — `fetchDetail` 需解析并透传 `fileSnapshot`
- **状态管理**: `workbench/app/lib/stores/workbench.ts` — 新增快照恢复方法
- **组件层**: `workbench/app/components/chat/Chat.client.tsx` 或 `workbench/app/lib/persistence/useChatHistory.ts` — 在历史项目加载时触发恢复
- **依赖**: 无新增外部依赖
