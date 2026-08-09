## 1. Schema & Cascade Setup (D2)

- [x] 1.1 Add `onDelete: Cascade` to `Session.project` and `AgentMessage.session` in `prisma/schema.prisma`
- [x] 1.2 Run `npx prisma db push` to apply the schema change
- [x] 1.3 Run `npx prisma generate` to regenerate the client
- [x] 1.4 Verify cascade works: write a one-off script that creates Project → Session → AgentMessage, deletes the Project, and asserts child rows are gone. If cascade fails (LibSQL/SQLite foreign_keys pragma), add a `PRAGMA foreign_keys = ON` init hook in `src/lib/prisma.ts` or switch to code-level transactional cascade.

## 2. API Routes — DELETE & PATCH (D3, D4)

- [x] 2.1 Create `src/app/api/projects/[id]/route.ts` with `DELETE` handler: `auth()` + ownership check + `prisma.project.delete` + return 204
- [x] 2.2 Add `PATCH` handler to the same file: validate `title`, update, return `{ id, title, updatedAt }`
- [x] 2.3 Return correct error shapes: 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 400 `INVALID_TITLE`

## 3. Detail Page (D1, D6)

- [x] 3.1 Create `src/app/projects/[id]/page.tsx` as a server component — `auth()` + ownership check, 404 if not owner, single Prisma query including sessions + messages
- [x] 3.2 Create `src/app/projects/[id]/ProjectDetailShell.tsx` — client shell with three tabs (preview / code / sessions), URL-synced tab state optional
- [x] 3.3 Create `src/app/projects/[id]/PreviewPane.tsx` — sandboxed iframe (`sandbox="allow-scripts allow-forms"`) with desktop/tablet/phone viewport switch
- [x] 3.4 Create `src/app/projects/[id]/CodePane.tsx` — wrap existing Shiki highlighter, add line numbers and "复制代码" button
- [x] 3.5 Create `src/app/projects/[id]/SessionsPane.tsx` — chronological AgentMessage list with agent-role avatar, timestamp, and per-role rendering

## 4. Delete Confirmation UI (D5)

- [x] 4.1 Add a trash-icon button to each card in `src/components/ProjectGrid.tsx` (hover-visible)
- [x] 4.2 Implement a `ConfirmPopover` client component — anchored to the trigger, "确定删除此项目？" + red "删除" button + "取消" button; clicking outside closes
- [x] 4.3 Wire the popover's confirm action to `DELETE /api/projects/:id` and remove the card from the list on success (optimistic or re-fetch)
- [x] 4.4 Add the same "删除项目" button + confirm popover to the detail page header; on success, redirect to `/my-projects`

## 5. UI Copy Unification (D7)

- [x] 5.1 In `src/app/my-projects/page.tsx`: replace "我的应用" → "我的项目", "共 N 个应用" → "共 N 个项目", "创建应用 →" → "创建项目 →", "还没有应用，去创建一个吧" → "还没有项目，去创建一个吧"
- [x] 5.2 In `src/components/ProjectGrid.tsx`: replace "搜索应用..." → "搜索项目...", "没有匹配的应用" → "没有匹配的项目"
- [x] 5.3 Leave `src/app/layout.tsx` description "AI Agent 驱动的 Web 应用生成平台" unchanged (per naming convention: refers to artifact class, not Project record)

## 6. Testing & Verification

- [x] 6.1 Start the dev server; verify `tsc --noEmit` is clean
- [x] 6.2 E2E test — detail page: log in, navigate to `/projects/:id` of an owned project, assert each tab renders (preview iframe, code highlight, session messages)
- [x] 6.3 E2E test — unauthorized access: visit another user's `/projects/:id` (or unauthenticated) and assert 404
- [x] 6.4 E2E test — rename: `PATCH /api/projects/:id` with new title, assert 200 and DB update; then assert 400 on empty title, 401 when unauthenticated, 404 on non-owned
- [x] 6.5 E2E test — delete with cascade: create a project with sessions + messages, `DELETE /api/projects/:id`, assert 204 and all child rows gone; then assert 404 on re-fetch
- [x] 6.6 E2E test — delete confirmation UI: hover a card, click trash, cancel → no delete; click delete → project removed from grid
