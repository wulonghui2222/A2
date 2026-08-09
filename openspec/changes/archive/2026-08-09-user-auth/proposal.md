## Why

当前系统完全匿名——所有生成的应用"无主"地存在数据库中，用户无法管理自己的项目。
引入用户认证后，用户可以注册、登录，并在"我的应用"页面查看和管理自己创建的所有应用。

## What Changes

- 新增用户注册和登录功能（NextAuth.js + Credentials Provider + JWT）
- 新增 User 数据表，Project 增加 userId 外键
- 新增 `/login`、`/register`、`/my-projects` 页面
- 新增 `middleware.ts` 保护需登录的路由
- 首页生成流程增加登录校验——未登录用户弹出登录提示
- Header 增加用户状态显示（头像/用户名 + 退出按钮）
- "我的应用"页面以卡片网格展示（缩略图 + 标题 + 生成时间）

## Capabilities

### New Capabilities

- `user-auth`: 用户注册、登录、会话管理（NextAuth.js + Credentials + bcrypt + JWT cookie）

### Modified Capabilities

- `app-core`: FR-01 生成流程增加登录前置校验；FR-04 数据持久化增加 userId 关联；
  FR-05 项目管理改造为"我的应用"页面（卡片网格，按用户过滤）

## Impact

- **数据库**: 新增 User 表；Project 表增加 `userId` 字段（nullable，向后兼容）
- **依赖**: 新增 `next-auth`、`bcryptjs`（密码哈希）
- **API**: 新增 `POST /api/auth/register`；NextAuth 接管 `/api/auth/*`
- **路由**: `middleware.ts` 保护 `/my-projects`、`/api/generate`（POST）
- **UI**: 新增 3 个页面 + Header 用户组件
