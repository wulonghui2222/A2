## Why

The `/my-projects` page currently shows a card grid of the user's projects, but clicking a card hits a 404 — there is no detail page, no way to delete, and no way to rename. This turns FR-05 from "project management" into "a list that you can't manage." Phase 1 fixes this by landing the detail page, delete (with cascade), and rename — while unifying the remaining "应用" UI copy to "项目" per the project-wide naming convention.

Phases 2 (public/private toggle + viewCount) and 3 (FR-07 gallery) are intentionally out of scope for this change.

## What Changes

- **ADD** a project detail page at `/projects/:id` with three tabs: live preview (iframe), source code view (with syntax highlighting via Shiki), and session history (PM / Architect / Engineer messages)
- **ADD** `DELETE /api/projects/:id` with cascade deletion of `Session` and `AgentMessage` rows
- **ADD** `PATCH /api/projects/:id` to rename a project's title
- **ADD** a delete confirmation popover on the project card / detail page
- **UNIFY** Chinese UI copy from "应用" to "项目" on `/my-projects` and related components (per the naming convention in `openspec/config.yaml`)
- **MODIFY** the existing `Project` schema to set `onDelete: Cascade` on the Session / AgentMessage foreign keys, so deleting a project cascades cleanly

## Capabilities

### New Capabilities

_(none — all changes extend the existing `app-core` capability)_

### Modified Capabilities

- `app-core`: adds three new scenarios to **FR-05 Project Management**:
  - **Scenario: View project detail** — authenticated owner navigates to `/projects/:id`; system renders iframe preview, code tab with syntax-highlighted source, and session history tab; clicking a card on `/my-projects` opens this page
  - **Scenario: Rename project** — owner submits a new title via `PATCH /api/projects/:id`; system updates the title and redirects/refreshes
  - **Scenario: Delete project** (expanding the existing one with concrete behavior) — owner confirms deletion; system cascades Session + AgentMessage deletes and redirects to `/my-projects`

## Impact

- **New routes**:
  - `src/app/projects/[id]/page.tsx` (server component, auth + ownership check)
  - `src/app/projects/[id]/PreviewPane.tsx`, `CodePane.tsx`, `SessionsPane.tsx` (client sub-components)
  - `src/app/api/projects/[id]/route.ts` (GET/DELETE/PATCH handlers)
- **Modified code**:
  - `src/components/ProjectGrid.tsx` — add delete button + confirm popover per card
  - `src/app/my-projects/page.tsx` — "应用" → "项目" copy
  - `prisma/schema.prisma` — `Session.project` and `AgentMessage.session` get `onDelete: Cascade`; run `prisma db push` and `prisma generate`
- **Dependencies**: Shiki already installed; no new runtime deps needed
- **Out of scope (Phase 2 / 3)**:
  - `isPublic` toggle UI
  - `viewCount++` logic
  - `/gallery` page (FR-07)
  - Remix (FR-06)
  - "click-to-preview without login" (FR-07)
  - Tag filtering UI (FR-07)

## Non-Goals

- Public / private visibility toggle (Phase 2)
- View-count tracking and popularity ranking (Phase 2/3)
- `/gallery` public showcase (FR-07, Phase 3)
- Remix / duplicate project (FR-06)
- Bulk operations (bulk delete, bulk visibility toggle)
- Tag editing UI (tags come from PM agent automatically; editing is out of scope)
- Anonymous preview of public projects (Phase 3)

## User Stories Referenced

- FR-05 Project Management (P1, Phase 3 in the roadmap — partial delivery in this change: detail + rename + delete)
- FR-08 Iterative Editing (P2, Phase 5 — the detail page lays the groundwork but iteration UI is out of scope)
