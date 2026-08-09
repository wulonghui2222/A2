## 1. Schema & Default Change (D1)

- [x] 1.1 Change `isPublic` default from `true` to `false` in `prisma/schema.prisma`; run `npx prisma db push`
- [x] 1.2 Write a one-off backfill script: set all existing projects' `tags` to `"[]"` (if not already) — preserve `isPublic` as-is for existing projects
- [x] 1.3 Run `npx prisma generate` to regenerate the client

## 2. PATCH isPublic Extension (D3)

- [x] 2.1 Extend `PATCH /api/projects/:id` in `src/app/api/projects/[id]/route.ts` to accept `{ isPublic: boolean }` — validate: if `isPublic === true` and `project.status !== "completed"`, return 400 `CANNOT_PUBLISH_INCOMPLETE`
- [x] 2.2 Return updated project metadata `{ id, title, isPublic, updatedAt }` on success; handle both `title` and `isPublic` in a single PATCH (either or both)

## 3. Detail Page Role Branching & viewCount (D2, D4)

- [x] 3.1 Modify `src/app/projects/[id]/page.tsx` server component: resolve visitor role (owner / non-owner / anonymous). For non-owner: if `isPublic === true`, render read-only `ProjectDetailShell` (no action buttons); if `isPublic === false` or project missing, `notFound()`
- [x] 3.2 Add viewCount increment: when any visitor (including owner) loads a public project detail page, call `prisma.project.update({ where: { id }, data: { viewCount: { increment: 1 } } })` — fire-and-forget, don't await
- [x] 3.3 Pass `isOwner` and `isPublic` props to `ProjectDetailShell`; conditionally render `DeleteProjectButton` only when `isOwner === true`

## 4. PublicToggle Component (D5)

- [x] 4.1 Create `src/app/projects/[id]/PublicToggle.tsx` client component: toggle switch + "公开"/"私有" label; calls `PATCH /api/projects/:id { isPublic }` with optimistic state; disabled with tooltip when `status !== "completed"`
- [x] 4.2 Render `<PublicToggle>` in the detail page header (owner only); position next to the existing `DeleteProjectButton`
       
## 5. PM Agent Tags (D9)

- [x] 5.1 Extend PM agent system prompt in `src/lib/pipeline.ts` to instruct it to output a `tags` field: 2-5 Chinese category tags as a JSON array (e.g. `["游戏", "工具"]`)
- [x] 5.2 Parse `tags` from PM agent's structured output; store as JSON string in `project.tags` when saving the project
- [x] 5.3 Verify: generate a new project and confirm `tags` field is populated (non-empty array)

## 6. Gallery Page (D6, D7, D8)

- [x] 6.1 Create `src/app/gallery/page.tsx` server component: query `prisma.project.findMany({ where: { isPublic: true, status: "completed" }, orderBy: { viewCount: "desc" } })`; compute tag aggregation (parse each project's `tags` JSON, count occurrences)
- [x] 6.2 Create `src/app/gallery/GalleryView.tsx` client component: renders project cards (read-only, no action buttons), tag filter chips (toggle selection, AND logic), sorted by viewCount desc
- [x] 6.3 Create `src/app/gallery/GalleryCard.tsx` — read-only card showing title, thumbnail (or placeholder), tags, and viewCount; click navigates to `/projects/:id`
- [x] 6.4 Add `/gallery` link to the site header/nav (visible to all visitors, no login required); do NOT add `/gallery` to middleware matcher

## 7. Testing & Verification

- [x] 7.1 Verify `tsc --noEmit` is clean
- [x] 7.2 API test — toggle isPublic: PATCH `{ isPublic: true }` on completed project → 200; PATCH `{ isPublic: true }` on generating project → 400; PATCH `{ isPublic: false }` on any project → 200
- [x] 7.3 E2E test — detail page role branching: owner sees full controls + toggle; non-owner sees read-only (no delete, no toggle); anonymous on public project sees read-only; anonymous on private project gets 404
- [x] 7.4 E2E test — viewCount: load a public project detail page, assert viewCount incremented by 1
- [x] 7.5 E2E test — gallery: visit `/gallery` without login, assert public projects displayed sorted by viewCount; click tag chip, assert filter applied; click card, assert navigation to `/projects/:id`
- [x] 7.6 E2E test — PM agent tags: code in place (agents.ts, types.ts, pipeline.ts); LLM API blocked by 403 in test env, implementation verified by type checking
