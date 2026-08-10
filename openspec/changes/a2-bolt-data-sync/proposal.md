## Why

`bolt-rewrite` (in progress) made A2 a portal+API and embedded the bolt fork as the
workbench iframe, but the two services still keep **separate data identities**:

- bolt has no notion of the logged-in A2 user — its browser-local IndexedDB chats are
  global to the machine, so two A2 users on the same browser see each other's chats.
- the project detail page (`/projects/:id`) is a dead-end read-only view; the owner must
  manually click "打开工作台" to reach the live workbench where editing actually happens.
- bolt's rich chat history never reaches A2, so the detail page "会话历史" tab is empty
  for every bolt-generated project (the old PM/Architect/Engineer pipeline that fed it
  was retired with `bolt-rewrite`).

This change **打通** (bridges) the two data planes: a consistent user identity flows
into bolt, an owner's project entry flows straight into the workbench, and a mirrored
chat history makes A2 the read-only system of record for a project's conversation.

## What Changes

**User identity through the seam (workbench-embed WE-05)**

- The `handshake` envelope now carries the A2 user's identity `{ id, displayName }` and
  the project's `title`. bolt renders the display name in its header and stores the A2
  user id in its seam state.

**Per-user chat scoping (workbench-embed WE-06)**

- bolt scopes its IndexedDB chats by the A2 user id, so different A2 users on the same
  browser no longer see each other's chats. No server-side chat storage is added — the
  browser-local IndexedDB remains the live-edit surface.

**Chat history mirror (workbench-embed WE-07 + app-core FR-05)**

- bolt posts its chat message history to A2 via a new `chat-history` seam message; A2
  persists it into the existing `Session` / `AgentMessage` tables through a new
  owner-only, token-redeemed API. The detail page "会话历史" tab is revived to render
  these bolt turns (`user` / `assistant` roles).

**Owner entry redirect (app-core FR-05)**

- `/projects/:id` keeps its read-only detail view for public/gallery viewers, but an
  **owner** landing there is redirected to `/workbench/:id` (the live workbench). The
  My-Projects card link to `/projects/:id` is unchanged; the redirect makes
  "click project → workbench" automatic for owners.

## Capabilities

### New Capabilities

- _(none — this change extends capabilities introduced or modified by `bolt-rewrite`)_

### Modified Capabilities

- `workbench-embed`: WE-05 (user identity in handshake), WE-06 (per-user chat scoping),
  WE-07 (chat-history sync seam message + API)
- `app-core`: FR-05 (owner detail entry redirects to workbench; session-history tab
  revived with bolt turns). The mirror persistence itself is owned by `workbench-embed`
  WE-07 to avoid colliding with `bolt-rewrite`'s in-progress FR-04 modification.

## Impact

- **Seam protocol**: `handshake` payload extended with `user` + project `title`; new
  `chat-history` message (bolt → A2) and `chat-history-ack` (A2 → bolt). Origin + token
  validation from WE-02 unchanged.
- **API**: new `POST /api/workbench/chat-history` (owner-only, token-redeemed, mirrors
  messages into `Session`/`AgentMessage`); reuses the `WorkbenchToken` redemption pattern
  from WE-02/WE-04.
- **Bolt fork**: `a2-seam` layer gains user-identity + chat-scoping + chat-history
  export; the chat list / IndexedDB store is keyed by `a2UserId`; the header shows the
  A2 display name.
- **A2 UI**: `/projects/:id` server `redirect()` for owners; `SessionsPane` renders bolt
  `user` / `assistant` roles (new `assistant` label).
- **Schema**: no new tables (reuses `Session` / `AgentMessage`); `AgentMessage.agentRole`
  gains the `assistant` value (column is a `String`, no migration); `Project.workbenchChatId`
  (added during `bolt-rewrite` verification) ties the mirrored session to the resumed chat.
- **Non-owner / public**: unchanged — public viewers still get the read-only detail +
  preview; the redirect is owner-only.

## Non-Goals

- Making the A2 mirror the **live edit surface** — bolt's IndexedDB remains primary; the
  A2 mirror is read-only history (display + cross-session record).
- Cross-device live chat resume — live resume still uses browser-local IndexedDB +
  `workbenchChatId`; the mirrored history is display-only.
- Proxying bolt's LLM traffic through A2 (still deferred per `bolt-rewrite` R3).
- Changing the My-Projects card link target (stays `/projects/:id`; the redirect handles
  the owner flow).
- bolt UI branding / localization beyond the display-name chip.
