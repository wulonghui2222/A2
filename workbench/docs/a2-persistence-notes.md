# A2 实测笔记：persistence / nanostores 数据流（任务 1.4）

> 依据 bolt.diy 0.0.5（gitee 镜像）源码实测，用于确认 design D4 的服务端持久化适配器接口。
> 实测日期：2026-08-10。涉及文件：`app/lib/persistence/db.ts`、`useChatHistory.ts`、
> `app/components/chat/Chat.client.tsx`、`app/components/sidebar/Menu.client.tsx`。

## 1. 现状：IndexedDB 存储

- 库名 `boltHistory` v1，object store `chats`：`keyPath: id`，索引 `id`（unique）、`urlId`（unique）。
- 记录结构 `ChatHistoryItem`：

  ```ts
  {
    id: string;           // 数字字符串（"1","2",...），客户端 getNextId 生成
    urlId?: string;       // URL slug，首个 artifact id 派生，冲突时追加 -2/-3
    description?: string; // 取自首个 artifact 的 title
    messages: Message[];  // ai SDK 的 Message；user 消息正文带
                          //   "[Model: ...]\n\n[Provider: ...]\n\n" 前缀元数据
    timestamp: string;    // ISO 时间，每次 put 刷新
  }
  ```

- `db.ts` 全部接口：`openDatabase / getAll / setMessages / getMessages(先按 id 再按 urlId) /
  getMessagesById / getMessagesByUrlId / deleteById / getNextId / getUrlId / forkChat /
  duplicateChat / createChatFromMessages / updateChatDescription`。

## 2. Chat 生命周期（写入时机）

1. 模块顶层 `await openDatabase()`（`VITE_DISABLE_PERSISTENCE` 可禁用），nanostores atom：
   `chatId`、`description`。
2. **加载**：路由 `/chat/$id` loader 给出 `mixedId` → `getMessages(db, mixedId)` →
   支持 `?rewindTo=<messageId>` 截断历史 → 回填 `initialMessages` 并设置两个 atom；
   空聊天 `navigate('/')`。
3. **写入**：`ChatImpl` 的 effect 以 50ms 节流采样 `messages`，当
   `messages.length > initialMessages.length` 时调 `storeMessageHistory(messages)`：
   - 首个 artifact 出现 → `urlId = getUrlId(firstArtifact.id)`，用
     `history.replaceState` 跳转 `/chat/<urlId>`（代码 FIXME：不能用 navigate，会重渲染）；
   - 首条聊天 → `getNextId()` 生成 id；
   - 最后 **整条记录全量 put**（`setMessages` = IndexedDB `store.put`，messages 数组整体替换）。
4. **侧栏列表**：`Menu.client.tsx` 用 `getAll(db)` 拉全量列表渲染历史；
   复制/导出/删除走 `duplicateChat / exportChat / deleteById`。

关键观察：**写入非常频繁**（流式生成期间每 50ms 节流一次全量 put），适配器必须容忍
幂等的全量覆盖写，或在客户端保留节流。

## 3. D4 适配器接口面（结论）

客户端只依赖 `db.ts` 的函数签名（`db` 句柄为第一参数）。服务端化替换策略：
`app/a2/persistence/` 提供同签名实现，内部改为 fetch resource routes；`useChatHistory`
与 nanostores 调用方零改动。

最小接口映射（客户端语义 → 服务端 route）：

| 客户端函数 | 语义 | 服务端 route（建议） |
|---|---|---|
| `getAll` | 列表 | `GET /api/projects` |
| `getMessages` / `ById` / `ByUrlId` | 详情（含 messages） | `GET /api/projects/:id` |
| `setMessages` | 全量 upsert | `PUT /api/projects/:id`（首次创建时服务端生成 id） |
| `deleteById` | 删除 | `DELETE /api/projects/:id` |
| `getNextId` / `getUrlId` | id/slug 分配 | 服务端创建时分配，客户端不再需要 |
| `forkChat` / `duplicateChat` / `createChatFromMessages` | 读+写组合 | 可保持客户端组合，或服务端 `POST /api/projects/:id/duplicate` |

Prisma schema（User/Project/Message）字段按上面记录结构落：
`Project { id, urlId, description, userId, updatedAt }` + `Message { id, projectId, role,
content, seq }`；`timestamp` 对应 `updatedAt`（我的项目按 updatedAt 倒序，任务 5.1）。

注意点：
- messages 里的 `[Model:]/[Provider:]` 前缀是消息内容的一部分，服务端按原文存储即可，
  不要剥离（`UserMessage.tsx` 渲染时才 strip）。
- 归属校验在 route 层做（session userId vs project.userId），对应 WB-08。
