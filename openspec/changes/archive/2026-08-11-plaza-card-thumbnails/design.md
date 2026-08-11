# Design: plaza-card-thumbnails

## Context

广场卡片缩略图采用方案 B（公开时自动截图）。技术约束决定了采集方式：

1. **无服务端截图能力**：部署目标是 Cloudflare Workers/Pages，无法运行 puppeteer
   等无头浏览器；WebContainer 也只能在浏览器中运行。
2. **现有 bolt 截图机制是唯一可行通道**：`ScreenshotSelector` 基于 `getDisplayMedia`，
   需要用户一次确认（共享当前标签页），无法完全静默——但它是唯一能穿透
   预览代理隧道限制的可靠通道（见文末结论）。
3. **Preview iframe 跨源**：WebContainer dev server 的预览地址位于独立源
   （`*.webcontainer-api.io`），父页面无法读取 iframe DOM，html-to-image /
   html2canvas 从父页面渲染 iframe 内容均不可行。

结论（2026-08 实测定案）：**注入式截图不可行**——预览代理只为 boot 时
的预览文档建立隧道，任何新加载的文档（隐藏 iframe、cache-bust 导航皆然）
只收到 "Unable to connect" 引导页，注入脚本永远无法在活页面执行；容器
dev server 也不暴露在宿主机 localhost，服务端无头截图同样不可行。
**最终方案复用工作台自带截图能力**：`getDisplayMedia` 共享当前标签页，
抓取一帧后裁剪预览区域。

## Goals / Non-Goals

**Goals**
- 公开（及重新公开）时自动后台截图，写入 `Project.thumbnail`
- 公开操作零阻塞；截图失败优雅降级为占位图
- 广场卡片展示真实缩略图（懒加载），占位图保留为降级路径

**Non-Goals**
- 不做历史已公开项目的批量回填（重新公开即可生成）
- 不做访客端截图、服务端截图、截图 CDN/对象存储
- 不做手动「重新截图」按钮（本阶段靠重新公开触发；后续可加）

## Decisions

### D1：采集管线 = 当前标签页捕获（最终版）

公开时直接用 `getDisplayMedia`（与 `ScreenshotSelector` 同源能力）：

1. 顶层约束 `preferCurrentTab: true` + `selfBrowserSurface: 'include'`
   （必须放 `getDisplayMedia` 选项顶层，嵌套进 `video` 会被浏览器忽略）。
   `selfBrowserSurface` 默认 `'exclude'` 会把**调用页面自身**从可选列表
   剔除（Chrome 实测：标签页列表只剩其他标签页），必须显式 include。
2. 拿到流后校验 `track.getSettings().displaySurface === 'browser'`；
   用户误共享整屏/窗口时停止流并重弹一次（最多 2 次提示）。
3. 弹窗前先清场：提示 toast 可读约 1.5s 后 dismiss 全部 toast，并注入
   `.Toastify{display:none!important}` 样式表贯穿整个捕获（防止浮层入镜，
   捕获结束移除）；抓帧前用 `requestVideoFrameCallback` 等两帧新画面，
   杜绝隐藏前旧缓冲。
4. 抓一帧绘制到 canvas，按 `devicePixelRatio` 映射可见预览 iframe 的
   视口矩形裁剪，取顶部 16:9 带，640px 宽渐进质量 JPEG 编码（D2）。
5. 结束立即 `stop()` 所有 track，停止共享。

代价：公开时需用户在浏览器共享弹窗确认一次。
收益：100% 可靠，不受预览代理隧道架构限制；完全不触碰项目文件树。

历史结论（为何不用注入）：代理隧道只认 boot 时文档，新文档永远
"Unable to connect"；容器端口不暴露宿主机，服务端无头截图不可行。

### D2：裁剪与压缩（最终版）

- 裁剪区域 = 可见预览 iframe 的 `getBoundingClientRect()` ×
  `devicePixelRatio`（Chrome 按 dpr 缩放捕获帧）；找不到预览 iframe
  时退化为整帧。
- 取裁剪区顶部 16:9 带，直接绘制到 640×360 canvas（白底，JPEG 无 alpha）。
- 渐进质量 0.7 → 0.55 → 0.4 → 0.3 → 0.2 → 0.1，base64 ≤ 200KB 即停，
  保证不触发服务端 413 上限。
- 编码后 POST 到 D3 路由；任何失败仅 console.warn + toast 告知 owner，
  不阻塞公开（PL-04）。

### D3：存储与上传

- `Project.thumbnail String?`：base64 JPEG，硬上限 **200KB**（服务端拒收 413，
  与 fileSnapshot 的守卫模式一致）。
- 新资源路由 `POST /api/a2/projects/:id/thumbnail`：session + owner 校验
  （同 visibility 路由），body `{ thumbnail: string }`，成功返回 `{ ok: true }`。
- 重新公开时直接覆盖旧值。

### D4：读取与展示

- 新资源路由 `GET /api/a2/projects/:id/thumbnail`：仅公开项目返回
  `image/jpeg`（`Cache-Control: public, max-age=3600`），非公开/无图 404
  （不泄露存在性，与快照路由一致）。
- `/plaza` loader 的 select 增加 `thumbnail: Boolean` 映射（只返回有无标记，
  不把 base64 塞进列表 HTML）；卡片 `<img loading="lazy" src="/api/a2/projects/:id/thumbnail">`，
  `onError`/无标记时回退占位图。需要 project id：列表 select 追加 `id`。

### D5：触发时机与状态反馈（修订版）

- 公开入口为**工作台头部按钮**（「保存」旁，见 D7）；「我的项目」列表页
  不再提供公开按钮。
- 点击公开后：强制保存快照（同「保存」按钮逻辑）→ 调 visibility 路由 →
  fire-and-forget 触发 D1 标签页捕获；toast「正在为项目生成缩略图…」→
  提示选择当前页的 toast（可读约 1.5s，弹窗打开前自动清场）→ 完成「缩略图已生成」/ 失败 toast
  原因（均标注不影响公开）。取消公开不清除缩略图
  （下次公开重新生成覆盖）。
- 采集全程不阻塞 UI；同一时刻最多一个采集任务（模块级锁，重复触发跳过）。

### D6：依赖（最终版：零新增依赖）

注入方案的 `html-to-image` 依赖、`vite.config.capture.mjs`、
`public/a2-thumb/capture.js` 与 `build:capture` 脚本已随方案废弃全部移除；
最终方案仅用浏览器原生 `getDisplayMedia` + canvas。

### D7：公开入口与自动快照（修订新增）

- 工作台头部（`HeaderActionButtons.client.tsx`，「保存」按钮旁）新增
  「公开到广场 / 取消公开」按钮；公开前自动执行一次强制快照保存
  （`saveProjectSnapshot`），visibility 路由的 409「请先保存」前置对正常
  流程不再可见（服务端守卫保留，防御并发/旧客户端）。
- 「我的项目」页移除 `VisibilityToggle`；列表页只保留打开/删除与公开状态
  展示。
- 取消公开（isPublic=false）仍走同一按钮，不触发采集、不清除缩略图。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 公开时需用户确认共享弹窗 | toast 提前说明；确认一次即完成，失败不阻塞公开 |
| 用户误共享整屏/窗口 | `displaySurface` 校验 + 重弹一次提示；仍不对则降级并说明 |
| toast 浮层被截进缩略图 | 弹窗打开前 dismiss 全部 toast + 捕获全程样式表压制 + 新帧等待 |
| 用户取消共享 | 优雅降级占位图 + toast 告知 owner（不影响公开） |
| 预览不可见（用户在代码视图） | 找不到预览 iframe 时退化为整帧裁剪；区域无效则降级 |
| 捕获的是用户当前屏幕画面 | 预览平时即为用户可见画面，质量可接受；toast 提示保持预览可见 |
| 浏览器不支持 getDisplayMedia | 降级 + toast 说明（不影响公开） |
| 200KB 上限对复杂页面不够 | 640×360 + 渐进质量循环，典型 20–60KB，够用 |

## Migration / Rollout

- `prisma db push` 增加列（nullable，存量行 NULL = 占位图），无需回填。
- 上线后已公开旧项目继续显示占位图；owner 取消公开再公开即可获得缩略图。
