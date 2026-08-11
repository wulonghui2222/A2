# 组件岛

## Purpose

组件岛（Widget Island）是 A2 平台的独立页面，用户输入自然语言描述，系统调用百炼 Wan3 模型生成一张桌面组件风格的图片并展示。该能力与现有项目生成逻辑完全解耦。

## Requirements

### Requirement: 组件岛页面可访问

系统 SHALL 提供 `/island` 路由页面，已登录用户可直接访问。页面 SHALL 包含左侧输入区（文本输入框 + 生成按钮）和右侧图片展示区。

#### Scenario: 已登录用户访问组件岛
- **WHEN** 已登录用户导航到 `/island`
- **THEN** 页面正常渲染，输入框显示占位提示文字，右侧展示区显示空状态引导（如"✨ 等待你的第一个灵感…"）

#### Scenario: 未登录用户访问组件岛
- **WHEN** 未登录用户导航到 `/island`
- **THEN** 重定向到登录页面

#### Scenario: Header 导航包含组件岛入口
- **WHEN** 用户查看 Header 导航栏
- **THEN** 导航栏中 SHALL 包含"组件岛"链接，点击跳转到 `/island`

---

### Requirement: 用户输入触发图片生成

用户输入描述文本并点击"生成"按钮后，系统 SHALL 将请求发送到 `POST /api/island/generate`，后端组装 prompt 并提交异步任务到 DashScope Wan3 API。

#### Scenario: 正常生成请求
- **WHEN** 用户输入非空文本并点击"生成"
- **THEN** 前端发送 POST 请求，展示区切换为"生成中"加载状态，返回 `taskId`

#### Scenario: 空输入拦截
- **WHEN** 用户未输入任何文本就点击"生成"
- **THEN** 前端阻止请求发送，提示用户输入内容

#### Scenario: Prompt 组装
- **WHEN** 后端收到用户输入
- **THEN** 系统 SHALL 将用户输入与预设的桌面组件风格引导词拼接，作为最终 prompt 发送给 Wan3 API

---

### Requirement: 异步轮询获取生成结果

系统 SHALL 提供 `GET /api/island/task/:taskId` 接口，前端通过轮询该接口获取任务状态，直到任务完成或失败。

#### Scenario: 任务进行中
- **WHEN** 前端轮询且 DashScope 返回任务状态为 PENDING 或 RUNNING
- **THEN** 接口返回 `{ status: "PENDING" }` 或 `{ status: "RUNNING" }`，前端继续轮询

#### Scenario: 任务完成
- **WHEN** 前端轮询且 DashScope 返回任务状态为 SUCCEEDED
- **THEN** 接口返回 `{ status: "SUCCEEDED", imageUrl: "<url>" }`，前端在展示区渲染生成的图片，停止轮询

#### Scenario: 任务失败
- **WHEN** 前端轮询且 DashScope 返回任务状态为 FAILED
- **THEN** 接口返回 `{ status: "FAILED", message: "<error>" }`，前端展示错误提示，停止轮询

#### Scenario: 轮询间隔
- **WHEN** 前端正在轮询
- **THEN** 轮询间隔 SHALL 为 2~3 秒

---

### Requirement: 认证保护

`/api/island/generate` 和 `/api/island/task/:taskId` 接口 SHALL 要求用户已登录。

#### Scenario: 未认证请求被拒绝
- **WHEN** 未登录用户调用任一组件岛 API
- **THEN** 返回 401 状态码，不执行任何上游调用
