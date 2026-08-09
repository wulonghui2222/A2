## Context

The user-auth change (archived as `2026-08-09-user-auth`) gave every project an owning
`User`. The `/my-projects` page lists the current user's projects. Beyond that,
project management is incomplete:

- Cards link to `/projects/:id` which doesn't exist (404)
- No route `DELETE /api/projects/:id`
- No rename affordance
- Prisma schema has no `onDelete: Cascade` on Session / AgentMessage FKs, so
  deleting a project would currently fail on foreign-key violations
- UI copy still mixes "应用" and "项目" (see `openspec/config.yaml` naming convention)

See proposal.md for why. See the modified spec for the target behavior.

## Goals / Non-Goals

**Goals:**

- Deliver a working project detail page with preview / code / session-history tabs
- Deliver hard-delete with cascade (project + sessions + messages)
- Deliver rename via `PATCH /api/projects/:id`
- Deliver a confirmation-before-delete affordance on cards and detail page
- Enforce "only owner sees / deletes / renames their project" (authZ on every endpoint)
- Unify Chinese UI copy to "项目" per `openspec/config.yaml`

**Non-Goals:**

- Public/private toggle, viewCount, popularity (Phase 2)
- `/gallery` public showcase (FR-07, Phase 3)
- Remix / duplicate (FR-06)
- Bulk operations
- Tag editing UI
- Anonymous preview of public projects

## Decisions

### D1. One page component, three client tab panes

```
   /projects/[id]/page.tsx  (server component)
        │
        ├─ auth() + ownership check; 404 if not owner
        ├─ fetch Project + Sessions + AgentMessages
        └─ render <ProjectDetailShell tabs=[preview, code, sessions]>
                                           │
                       ┌───────────────────┼──────────────────┐
                       │                   │                  │
                 PreviewPane        CodePane         SessionsPane
                 (iframe,           (Shiki HL,       (message list,
                  viewport           copy button,     agent-role
                  switch)            line numbers)    avatar, time)
```

**Rationale:** Keeping `page.tsx` as a server component lets us do auth/ownership and
a single Prisma `include` query up front. The three panes are client components so
tab switching is instant and viewport toggles don't cause server round-trips.

**Alternatives considered:**
- Server-side tab rendering with URL-based tab state → slower tab switching, more
  hydration churn. Rejected.
- Separate `/projects/[id]/preview` and `/projects/[id]/code` routes → more routes,
  harder to share layout. Rejected.

### D2. Delete uses hard delete + DB-level cascade via `onDelete: Cascade`

```prisma
model Project {
  ...
  sessions  Session[]       // already present
}

model Session {
  ...
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  messages  AgentMessage[]
}

model AgentMessage {
  ...
  session   Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}
```

**Rationale:** Single `prisma.project.delete()` cleans up everything transactionally.
Cascade at the DB layer is atomic and survives even if the app code changes.

**SQLite caveat:** LibSQL/SQLite only enforces FK constraints when `PRAGMA foreign_keys = ON`
is set per connection. The Prisma LibSQL adapter doesn't enable it by default.

**Mitigation:** Add a connection-init hook that runs `PRAGMA foreign_keys = ON` before
each query. Concretely, in `src/lib/prisma.ts`, wrap the adapter's `connect` or add
a middleware/extension that issues the pragma on first use. If this proves intrusive,
fall back to **explicit code-level cascade**: inside the DELETE handler, wrap
`prisma.$transaction([deleteMany AgentMessage, deleteMany Session, delete Project])`.

**Alternatives considered:**
- Soft delete (`status: "deleted"`) → clutters DB, requires filter everywhere. Rejected.
- Code-level cascade only → more code, risk of missing a relation. Keep as fallback.

### D3. `PATCH /api/projects/:id` for rename (single field for now)

```
PATCH /api/projects/:id
{ "title": "New Title" }

→ 200 { id, title, updatedAt }
→ 400 { error, code: "INVALID_TITLE" }      if empty / too long
→ 401 { error, code: "UNAUTHORIZED" }       if not logged in
→ 404 { error, code: "NOT_FOUND" }          if not owner or missing
```

**Rationale:** Using a focused PATCH keeps the endpoint open for future fields
(`description`, `isPublic` in Phase 2) without overloading the route.

**Alternatives considered:**
- `POST /api/projects/:id/rename` → RPC-style, less RESTful, doesn't extend. Rejected.

### D4. AuthZ in route handlers, not in middleware

Middleware protects `/my-projects` and `/api/generate`. We deliberately **don't**
add `/projects/:id` or `/api/projects/:id` to middleware's matcher. Instead,
each route handler performs its own `auth()` + ownership check.

**Rationale:**
- Ownership is per-resource (need the `id` param), which middleware doesn't have cleanly.
- The same `/projects/:id` URL must serve different responses by role (owner vs 404)
  — middleware is binary (allow/deny).
- Keeps middleware focused on "logged-in / logged-out" gates; authZ belongs to handlers.

**Alternatives considered:**
- Middleware with path-param parsing → brittle, duplicates logic. Rejected.

### D5. Delete confirmation: popover, not modal, not toast-undo

- On `/my-projects` card: hover reveals a trash icon; clicking opens a small popover
  ("确定删除此项目？" with red "删除" button and gray "取消").
- On `/projects/:id`: a "删除项目" button in the page header with the same popover.

**Rationale:** Popover is lighter than a modal (no backdrop, no focus trap), keeps
context visible. Toast-undo is risky for destructive hard-delete — once the toast
dismisses, the data is gone, and there's no recovery story in this demo.

**Alternatives considered:**
- Modal dialog → heavier UX, overkill for single confirmation. Rejected.
- Toast with undo → elegant but risky without soft-delete. Rejected.
- Two-click without popover (click → immediate delete) → too easy to misfire. Rejected.

### D6. Reuse existing Shiki setup for the code tab

The project already uses Shiki for code display in the preview pipeline
(`CodePreview` component exists from the initial-setup change). The `CodePane`
tab component wraps the same Shiki highlighter with line numbers and a
"复制代码" button.

**Rationale:** Zero new dependencies. Consistent highlighting across the app.

**Alternatives considered:**
- `react-syntax-highlighter` → different highlighter, visual inconsistency. Rejected.

### D7. UI copy: single sweep using the naming convention

A single task replaces "应用" with "项目" in the user-facing Chinese copy:

- `src/app/my-projects/page.tsx`: 我的应用 → 我的项目, 共 N 个应用 → 共 N 个项目, 创建应用 → 创建项目, 还没有应用 → 还没有项目
- `src/components/ProjectGrid.tsx`: 搜索应用... → 搜索项目..., 没有匹配的应用 → 没有匹配的项目

Per the convention, marketing copy like "AI Agent 驱动的 Web **应用**生成平台" in
`layout.tsx` stays as "应用" because it refers to the artifact class ("Web App"),
not a managed Project record.

## Risks / Trade-offs

- **[Cascade may not fire under LibSQL]** → Mitigation: add the `PRAGMA foreign_keys = ON`
  init hook; if blocked, switch to code-level transactional cascade (D2 fallback).
- **[Detail page exposes project code to browser]** → Mitigation: only to the owner.
  No public surface in Phase 1; this becomes a concern in Phase 2/3.
- **[Delete is irreversible]** → Mitigation: popover confirmation + explicit red button.
  Soft-delete / trash-bin is a Phase 2+ consideration only if users request it.
- **[Shiki tokenizes large code blobs slowly on first open]** → Mitigation: lazy-render
  the CodePane tab only when selected; use a memoized highlighter instance.
- **[Search currently uses `title + description`; spec says "title or content"]** → Out of
  scope for this change. The existing search is preserved. Extending it to search
  generated code is deferred to a later change (needs full-text indexing decision).
