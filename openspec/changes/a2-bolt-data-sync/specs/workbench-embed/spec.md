## ADDED Requirements

### Requirement: WE-05 User Identity Handoff

**Priority**: P0

The system SHALL deliver the authenticated A2 user's identity to the workbench through
the seam handshake, so the bolt fork can display the user and scope its data. The
`handshake` envelope SHALL carry `user: { id, displayName }` and `project.title`
alongside the existing token and project context. The workbench SHALL render the
display name in its header and store the A2 user id in its seam state. The identity
payload SHALL NOT confer any write authority — every persistence call still goes
through an A2 API route under the user's session (WE-02 unchanged).

#### Scenario: Identity delivered with the handshake

- **GIVEN** an authenticated owner opens `/workbench/:projectId`
- **WHEN** A2 sends the `handshake` message
- **THEN** the payload includes `user.id`, `user.displayName`, and `project.title`
- **AND** the bolt fork stores `user.id` in its seam state and renders `displayName` in its header

#### Scenario: Anonymous / non-seem load falls back

- **GIVEN** the workbench is loaded outside the A2 seam (e.g. opened directly at `WORKBENCH_ORIGIN`)
- **WHEN** no handshake with a `user` payload is received
- **THEN** the workbench shows no A2 display name and treats the chat scope as anonymous-default

#### Scenario: Identity carries no write authority

- **GIVEN** a `handshake` whose `user.id` does not match the project's owner
- **WHEN** any write seam message or A2 API call is attempted
- **THEN** the server-side ownership check (WE-02 / WE-04) rejects it and nothing is persisted

---

### Requirement: WE-06 Per-User Chat Scoping

**Priority**: P1

The workbench SHALL scope its browser-local chat store (IndexedDB) by the A2 user id
received in the handshake, so chats belonging to different A2 users on the same browser
are isolated. A chat created under one A2 user SHALL NOT appear in another A2 user's
chat list. Project-scoped chat resume (via `workbenchChatId`) SHALL still load the
correct chat regardless of scoping, because the chat id is carried by the A2 project.

#### Scenario: Two A2 users on the same browser stay isolated

- **GIVEN** user A and user B both authenticate to A2 on the same browser, each creating projects
- **WHEN** user A opens the workbench and the handshake carries `user.id = A`
- **THEN** the workbench's chat list shows only chats scoped to A
- **AND** user B's chats are not visible or enumerable

#### Scenario: Project-scoped resume bypasses list scoping

- **GIVEN** a project with a persisted `workbenchChatId`
- **WHEN** the owner reopens `/workbench/:projectId`
- **THEN** the workbench loads `/chat/<workbenchChatId>` directly and restores the chat
- **AND** the chat is associated with the owner's scope for any future listing

#### Scenario: Scope persists across iframe reloads

- **GIVEN** the workbench iframe reloads (dev HMR, manual refresh)
- **WHEN** the handshake re-runs on the new iframe load (per-load handshake, WE-02)
- **THEN** the A2 user id is re-established and chat scoping remains consistent

---

### Requirement: WE-07 Chat History Sync

**Priority**: P1

The system SHALL mirror the workbench chat history into A2's `Session` / `AgentMessage`
tables so the project detail page can display the conversation. The workbench SHALL post
a `chat-history` seam message containing the chat message list (user and assistant turns
with their content and timestamps); A2 SHALL persist it through a new owner-only,
token-redeemed API and reply `chat-history-ack`. The mirror SHALL be read-only — the
live chat remains in the workbench's IndexedDB; A2 never writes back into the live chat.

**API**: `POST /api/workbench/chat-history`
```
Request:  { projectId: string, token: string, urlId?: string, messages: [{ role, content, timestamp }] }
Response: { ok: true }
```
The API SHALL redeem a one-time `WorkbenchToken` (owner-scoped, WE-02 pattern) and
SHALL upsert the `Session` + `AgentMessage` rows for the project, keyed by the workbench
chat so repeated syncs replace rather than duplicate.

#### Scenario: History mirrored after a save

- **GIVEN** a workbench session that has produced a chat history
- **WHEN** the user triggers Save to A2 (WE-04)
- **THEN** the workbench also posts `chat-history` with the current message list
- **AND** A2 persists the turns into `Session` / `AgentMessage` and replies `chat-history-ack`
- **AND** the detail page "会话历史" tab renders the bolt conversation (user / assistant roles)

#### Scenario: Incremental sync during a chat

- **GIVEN** the user continues iterating inside the workbench after the first save
- **WHEN** a new assistant turn completes
- **THEN** the workbench posts an updated `chat-history` payload
- **AND** A2 upserts the session so the new turn appears without duplicating earlier ones

#### Scenario: Rejected for non-owner or invalid token

- **GIVEN** a `chat-history` request whose token is expired, already consumed, or issued for another project
- **WHEN** it reaches `POST /api/workbench/chat-history`
- **THEN** the system rejects it (403) and the stored history is unchanged

#### Scenario: Mirror is read-only

- **GIVEN** a project whose chat history has been mirrored to A2
- **WHEN** the owner reopens the workbench
- **THEN** the live chat is resumed from the workbench's IndexedDB (and `workbenchChatId`), never from the A2 mirror
- **AND** the A2 mirror is only read by the detail page session-history view
