## 1. Identity & Chat Scoping (WE-05, WE-06)

- [x] 1.1 Extend the `handshake` envelope to carry `user: { id, displayName }` and `project.title` — A2 `WorkbenchClient.tsx` sends the extended payload from server-provided props; bolt `a2-seam/index.ts` stores `a2UserId` / `displayName` in `a2SeamState` on handshake receipt
- [x] 1.2 Render the A2 `displayName` in the bolt header so the logged-in user is visible inside the workbench
- [x] 1.3 Add an optional `a2UserId` field to bolt's IndexedDB chat records (`db.ts`) and tag every newly created chat with the current `a2UserId` from seam state inside `storeMessageHistory` (`useChatHistory.ts`)
- [x] 1.4 Filter the bolt chat-list/sidebar query by the current `a2UserId` so two A2 users on the same browser never see each other's chats; existing unscoped chats fall back to `anonymous-default` scope (hidden from all logged-in users)

## 2. Chat History Mirror (WE-07)

- [x] 2.1 Add a `chat-history` seam message to bolt — `notifyA2ChatHistory(messages[])` helper in `a2-seam/index.ts`; trigger after Save and after each assistant turn end (debounce ~1s, tune during implementation)
- [x] 2.2 Create `POST /api/workbench/chat-history` route (owner-only, one-time `WorkbenchToken` redemption, `Session.upsert` + `AgentMessage.deleteMany` + `AgentMessage.createMany` in a single transaction, reply `{ ok: true }`)
- [x] 2.3 Handle the `chat-history` message in A2 `WorkbenchClient.tsx` — re-issue a fresh token, POST to the new route, and reply `chat-history-ack` to bolt (mirror the existing `artifact` / `chat-url` handler pattern)
- [x] 2.4 Add `assistant` role to `ROLE_META` in `SessionsPane.tsx` so the detail-page session-history tab renders bolt conversation turns (user / assistant); legacy pm/architect/engineer labels remain

## 3. Owner Redirect & Management Redistribution (FR-05)

- [x] 3.1 Add server-side `redirect('/workbench/' + id)` in `/projects/[id]/page.tsx` for the authenticated owner, before `viewCount` increment; public viewers and 404 path fall through unchanged
- [x] 3.2 Remove the now-unreachable `OpenWorkbenchButton` (header button + body banner) from the detail page — owners are redirected before render, public viewers cannot open the workbench
- [x] 3.3 Add owner-only management controls to the workbench page header: a delete entry (reuse `DeleteProjectButton`) and the public toggle (reuse `PublicToggle`)
- [x] 3.4 Add a "重命名" item to the My-Projects card hover menu (`ProjectGrid.tsx`) that calls `PATCH /api/projects/:id` with the new title

## 4. Regression & Verification

- [x] 4.1 Extend `tests/workbench-api-test.mjs` with a `chat-history` API test case (valid token → 200 + rows persisted; expired/wrong-project token → 403)
- [x] 4.2 Run `tsc --noEmit` on A2 and workbench; run the full test suite; confirm `public-toggle-gallery-test.mjs` stays green (public viewer path unaffected by owner-only changes)
