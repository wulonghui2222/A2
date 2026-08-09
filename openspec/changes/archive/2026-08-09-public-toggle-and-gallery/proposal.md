## Why

Projects are currently always public (`isPublic` defaults to `true`) but there is no mechanism to toggle visibility, no view counter, and no public gallery to discover others' work. Adding these features turns A2 Atoms Demo from a personal sandbox into a shareable showcase — users can control who sees their projects, track popularity, and browse community creations.

## What Changes

- Add an **isPublic toggle** on the project detail page (owner-only control)
- Extend `PATCH /api/projects/:id` to accept `{ isPublic: boolean }` with constraint: only `completed` projects can be made public
- Branch detail page rendering: **owner** sees full controls (delete, rename, toggle); **non-owner** sees a read-only view (preview + code + sessions, no action buttons) — only when `isPublic === true`, otherwise 404
- Add **viewCount** increment when any visitor (including owner) opens a public project's detail page
- Extend the **PM agent pipeline** to output a `tags[]` field (e.g. `["游戏", "工具"]`); backfill existing projects with empty tags
- Create a **`/gallery` page** (no login required) listing all public projects sorted by `viewCount DESC`
- Add **tag filter chips** on the gallery (aggregated from all public project tags)
- Gallery cards are **read-only** — click navigates to the owner's public detail page (`/projects/:id`)

## Non-Goals

- FR-06 (Template System / Remix) — deferred to a future change
- Comment / like / social features on gallery projects
- Pagination / infinite scroll on gallery (assume manageable dataset for now)
- Separate gallery detail page — reuses the read-only branch of `/projects/:id`

## Capabilities

### New Capabilities

- `project-gallery`: Public gallery page (`/gallery`) with browse, tag filter, popularity sort, and read-only project cards linking to detail pages.

### Modified Capabilities

- `app-core`: FR-05 (Project Management) — add public/private toggle, viewCount tracking, read-only detail branch for non-owners. FR-07 (Project Gallery) — define gallery page behavior. FR-02 (Multi-Agent Collaboration) — PM agent outputs tags.

## Impact

- **API**: Extend `PATCH /api/projects/:id` to handle `isPublic` field; add `GET /api/gallery` for public projects
- **Pages**: Modify `src/app/projects/[id]/page.tsx` (role-based rendering, viewCount++); create `src/app/gallery/page.tsx`
- **Pipeline**: Extend PM agent prompt and response parsing to output `tags[]`; backfill script for existing projects
- **Schema**: No schema changes needed (fields already exist); `isPublic` default may change from `true` to `false`
- **Middleware**: Add `/gallery` to public routes; `/projects/:id` remains unauthenticated at middleware level (auth checked per-resource)
- **Navigation**: Add gallery link to header/nav for all visitors
