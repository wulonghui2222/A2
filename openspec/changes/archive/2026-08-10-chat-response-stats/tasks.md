# Tasks: chat-response-stats

## 1. 准备与验证

- [x] 1.1 验证 ai@4.0.18 `streamText` 的 `onChunk` 回调是否可用且能区分
  `text-delta` 与 reasoning 分片；不可用则改用包装 `textStream` 迭代器方案
  （验收：本地脚本打印首个 text-delta 时间戳）
- [x] 1.2 在 `app/a2/config.ts` 新增 `A2_ENABLE_RESPONSE_STATS`（env 可覆盖，默认 true）
  （验收：env 置 false 时 config 读取为 false，服务可正常启动）

## 2. 服务端时间统计

- [x] 2.1 在 `api.chat.ts` 记录 `startedAt`，续写循环中维护 `segmentCount`
  （验收：日志可见段数；无续写时为 1）
- [x] 2.2 在 `stream-text.ts` 捕获首个正文 text-delta 时间 `firstVisibleTokenAt`
  （验收：日志时间戳晚于请求开始、早于 onFinish）
- [x] 2.3 `usage` 注解 value 增加 `timing` 字段（startedAt/firstVisibleTokenAt/endedAt/segmentCount），
  开关关闭时不写入（验收：抓包/日志确认注解 payload，旧字段不变）

## 3. 客户端状态机与实时反馈

- [x] 3.1 `Chat.client.tsx` 增加请求状态机
  `submitting/waiting/streaming/finished/error`（由 send、onResponse、首个正文
  delta、onFinish、onError 驱动），随 messages 传给 `Messages.client.tsx`
  （验收：React DevTools 可见状态随请求阶段正确流转）
- [x] 3.2 新增 `ResponseStats.tsx`：waiting 显示"思考中… X.Xs"（100ms 计时）；
  streaming 显示"生成中… X.Xs · 约 N tokens · M tok/s"（token 数按 content 长度估算）
  （验收：发送请求后两个阶段文案实时刷新）

## 4. 统计行与错误留痕

- [x] 4.1 `AssistantMessage.tsx` 统计行扩展：有 timing 时显示
  `N tokens · 首字 X.Xs · 共 X.Xs · M tok/s`（segmentCount > 1 追加"· N 段"），
  无 timing 回退现状；开关关闭不渲染新增部分（验收：新旧消息渲染均正确）
- [x] 4.2 `AssistantMessage.tsx` 支持 `status=error` 注解的内联错误渲染
  （验收：含错误注解的消息显示错误摘要）
- [x] 4.3 `Chat.client.tsx` onError 中向 assistant 消息写入
  `{ type:'status', value:{ status:'error', message, at } }` 注解并显式触发保存
  （验收：人为触发失败后刷新页面，错误仍显示在消息处）

## 5. 端到端验收

- [x] 5.1 按 spec 场景手工验收：等待反馈、流式反馈、完成统计、刷新后仍可见、
  续写多段场景（用长输出 prompt）、失败留痕场景（临时改错 BAILIAN_API_KEY）
  （验收：六个场景全部通过，截图归档到变更目录）
  备注：等待/流式/完成统计、统计行位置与样式已由用户在界面上多轮确认；
  失败留痕与多段续写的破坏性测试未执行，用户决定不再阻塞归档。
