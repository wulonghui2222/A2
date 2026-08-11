# Tasks: plaza-card-thumbnails

## 1. 数据层

- [x] 1.1 `workbench/prisma/schema.prisma` 的 `Project` 模型增加 `thumbnail String?`，执行 `prisma db push` 并 `prisma generate`，确认 IDE/CLI 类型可用

## 2. 服务端路由

- [x] 2.1 新增资源路由 `app/routes/api.a2.projects.$id.thumbnail.ts`：`POST` 接收 `{ thumbnail: string }`，session + owner 校验（模式同 visibility 路由），base64 解码后 >200KB 返回 413，成功写入 `Project.thumbnail` 并返回 `{ ok: true }`
- [x] 2.2 同路由实现 `GET`：仅公开项目返回 base64 解码后的 `image/jpeg`（`Cache-Control: public, max-age=3600`），非公开或无缩略图返回 404
- [x] 2.3 `plaza._index.tsx` loader 的 `select` 增加 `id` 与 `thumbnail: Boolean` 映射（不把 base64 带入列表数据）

## 3. 采集模块（当前标签页捕获，最终版 D1）

- [x] 3.1 重写 `app/a2/plaza/capture-thumbnail.ts` 为当前标签页捕获：`getDisplayMedia` 顶层 `preferCurrentTab: true, selfBrowserSurface: 'include'`；拿到流后校验 `displaySurface`（`undefined`/`browser` 通过），不对则停止流重弹（最多 2 次）；模块级锁同一时刻最多一个任务
- [x] 3.2 浮层处理：提示 toast 可读 1.5s 后、共享弹窗打开前 dismiss 全部 toast，并在捕获期间注入 `.Toastify{display:none!important}` 样式表（finally 移除，结果 toast 正常显示）；`requestVideoFrameCallback` 等两帧新画面再抓帧
- [x] 3.3 裁剪/压缩/上传：可见预览 iframe `getBoundingClientRect()` × `devicePixelRatio`（找不到退化为整帧），顶部 16:9 带绘入 640×360 白底 canvas，渐进质量 0.7→0.1 至 base64 ≤200KB，POST 到 2.1 路由；结束立即 stop 所有 track

## 4. 注入方案残留清理（历史方案废弃）

- [x] 4.1 移除 `html-to-image` 依赖、`vite.config.capture.mjs`、`public/a2-thumb/capture.js`、`capture/capture-script.ts` 与 `build:capture` 脚本（`build` 还原为 `remix vite:build`）
- [x] 4.2 采集模块头注释说明架构墙：代理隧道只认 boot 时预览文档，新文档只收 "Unable to connect" 引导页，注入不可行（见 design 结论）

## 5. 公开入口迁移（修订版 D7）

- [x] 5.1 `HeaderActionButtons.client.tsx` 新增「公开到广场 / 取消公开」按钮（「保存」旁，登录后可见）：点击公开 = 强制保存快照（saveProjectSnapshot）→ POST visibility → fire-and-forget 触发采集；toast「正在为项目生成缩略图…」→「缩略图已生成」，失败静默；取消公开只调 visibility，不触发采集、不清除缩略图；按钮初始态需读当前项目 isPublic（GET /api/projects/:id 或 loader 下发）
- [x] 5.2 `my-projects.tsx` 移除 VisibilityToggle 及其 toast/采集挂接（保留公开状态展示文案可选）；卡片只留打开/删除

## 6. 广场卡片展示

- [x] 6.1 `plaza._index.tsx` 卡片：有缩略图标记时渲染 `<img loading="lazy" src="/api/a2/projects/:id/thumbnail">`，`onError` 或无标记回退现有火箭占位图

## 7. 验证

- [x] 7.1 `pnpm run typecheck` 与 eslint 通过
- [x] 7.2 端到端手动验证：工作台打开项目 → 点「公开到广场」（无需先手动保存）→ 提示 toast 可读后自动清场 → 共享弹窗选当前标签页并确认 → 「缩略图已生成」且截帧不含 toast 浮层；刷新 `/plaza` 卡片显示真实截图；非 owner 上传被拒；「我的项目」页确认公开按钮已移除
