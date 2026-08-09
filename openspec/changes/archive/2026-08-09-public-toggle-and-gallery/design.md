## Context

The `project-detail-and-delete` change established a full-control detail page at `/projects/:id` that only the owner can access (404 for everyone else). The Prisma schema already has `isPublic` (default `true`), `viewCount` (default `0`), and `tags` (default `"[]"`) fields but they are unused. This change activates those fields and adds a public gallery.

Current state:
- `/projects/:id` returns 404 for non-owners (server component, `notFound()`)
- `PATCH /api/projects/:id` handles `title` only
- No `/gallery` route exists
- PM agent pipeline does not output `tags`
- `isPublic` defaults to `true` — all projects are technically public but unlisted

## Goals / Non-Goals

**Goals:**
- Owner-controlled public/private toggle with "completed only" constraint
- Role-based detail page: owner sees full controls, non-owner sees read-only view for public projects
- View count tracking on every public detail page load
- PM agent auto-generates `tags[]` during generation
- Public gallery page with tag filtering and popularity sorting

**Non-Goals:**
- Pagination / infinite scroll on gallery
- Remix / template system (FR-06)
- Social features (comments, likes)
- Separate gallery detail page

## Decisions

### D1: isPublic default → false

**Decision**: Change `isPublic` default from `true` to `false` in `prisma/schema.prisma`.

**Rationale**: Opt-in sharing is safer than opt-out. Users explicitly choose which projects to share. The gallery only shows public projects, so defaults shouldn't accidentally expose work-in-progress.

**Alternative**: Keep `true` default — rejected because generating projects would be public before the owner reviews them.

### D2: viewCount increment — server component, no deduplication

**Decision**: Increment `viewCount` in the server component (`/projects/:id` page) on every successful load of a public project. No IP/session deduplication.

**Rationale**: Simple and predictable. Deduplication requires session/IP tracking infrastructure that's overkill for a demo. Owner's own visits count (consistent with "total page views" semantics).

**Alternative**: Client-side fetch for increment — rejected because server components can't reliably detect their own re-renders vs client navigations.

### D3: PATCH endpoint — extend existing, not new route

**Decision**: Extend `PATCH /api/projects/:id` to accept `{ isPublic: boolean }` alongside existing `{ title: string }`. Validate: if `isPublic === true` and `project.status !== "completed"`, return 400 `CANNOT_PUBLISH_INCOMPLETE`.

**Rationale**: Keeps one endpoint for project metadata updates. The constraint prevents publishing incomplete projects.

### D4: Detail page role branching — single server component, conditional rendering

**Decision**: `/projects/:id` page.tsx remains a server component. It resolves the visitor's role (owner / non-owner / anonymous) and conditionally renders:
- **Owner**: full `ProjectDetailShell` with all controls + `DeleteProjectButton` + `PublicToggle`
- **Non-owner + public**: read-only `ProjectDetailShell` (no action buttons)
- **Non-owner + private or missing**: `notFound()`

**Rationale**: Matches existing pattern from `project-detail-and-delete`. The `resolveOwner` helper in the API route already handles ownership; the page component extends this logic.

### D5: PublicToggle component — client component with optimistic update

**Decision**: Create `PublicToggle.tsx` client component that calls `PATCH /api/projects/:id { isPublic }` with optimistic UI. Shows a toggle switch + "公开"/"私有" label. Disabled when `status !== "completed"` (with tooltip explaining why).

**Rationale**: Toggle needs immediate visual feedback. Client-side PATCH call with optimistic state matches existing `ConfirmPopover` pattern.

### D6: Gallery page — server component with client filter

**Decision**: `/gallery/page.tsx` is a server component that queries `prisma.project.findMany({ where: { isPublic: true, status: "completed" }, orderBy: { viewCount: "desc" } })`. The page renders a `<GalleryView>` client component that handles tag filtering client-side (no extra server round-trips for filter changes).

**Rationale**: Initial data fetch is server-side (single query, SEO-friendly). Filtering is client-side because the dataset is small and tag toggling should feel instant.

### D7: Tag aggregation — computed server-side

**Decision**: Gallery server component aggregates tags from all public projects: parse each project's `tags` JSON string, count occurrences, pass `{ tag: string, count: number }[]` to the client component.

**Rationale**: Single query, no extra API call. The `tags` field is a JSON string in the DB; parsing is trivial. For large datasets this could be cached, but unnecessary for demo scale.

### D8: Gallery route — no middleware protection

**Decision**: `/gallery` is NOT in the middleware matcher. It's a fully public route accessible without authentication.

**Rationale**: The gallery is a showcase — login shouldn't be required to browse. This aligns with the spec ("no login required").

### D9: PM agent tags — prompt engineering + JSON extraction

**Decision**: Extend the PM agent's system prompt to instruct it to output a `tags` array (2-5 Chinese category tags) in its structured output. Parse the tags from the PM agent's response and store in `project.tags` (JSON string). Backfill existing projects with `[]`.

**Rationale**: The PM agent already produces structured output; adding tags is a prompt extension. JSON string storage matches the existing schema.

## Risks / Trade-offs

- **[viewCount inflation]** → No deduplication means a user refreshing inflates the count. Acceptable for demo; document this limitation in the gallery UI ("浏览次数").
- **[Race condition on viewCount++]** → Concurrent reads could miss increments (read-then-write). For demo scale this is negligible. If it becomes an issue, use `prisma.project.update({ increment: { viewCount: 1 } })`.
- **[PM agent tags quality]** → LLM-generated tags may be inconsistent. Mitigation: constrain the prompt to a small vocabulary or use few-shot examples.
- **[isPublic default change]** → Existing projects with `isPublic: true` won't auto-flip. Run a backfill to set existing projects to `false` (or leave as-is since they were already "public").
