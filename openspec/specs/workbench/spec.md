# Workbench 生成工作台

## Purpose

提供基于 bolt.diy fork 的生成工作台：用户通过聊天式对话驱动 AI 生成与迭代多文件
工程，WebContainer 提供实时运行预览，编辑器与终端支持手工修改，全部聊天与项目
数据持久化在服务端，并提供中文的"我的项目"管理界面。

## Requirements

### Requirement: WB-01 Chat-Based Generation

**Priority**: P0

The system SHALL allow authenticated users to generate a multi-file project by entering
a natural language description in the workbench chat. Generation SHALL stream
incrementally: assistant text, file actions, and shell actions appear in the chat as
they are produced, and files are written into the project workspace while streaming.
For a first generation (a new chat with no prior messages), when the agent mode is set
to multi-agent, the system SHALL precede generation with a PD planning round and a
mandatory review gate as defined by the `multi-agent` capability, and execution after
approval SHALL be driven step by step by the TL orchestrator as defined by the
`tl-orchestrator` capability; while the planning round is active, no workspace file
SHALL be written before the gate is passed. In single-agent mode the system SHALL
follow the direct path without planning or orchestration for every message. In
multi-agent mode, follow-up (iteration) messages SHALL first pass the triage defined
by the `multi-agent` capability: trivial changes follow the direct path, while major
changes enter the same planning round, mandatory gate, and TL step-by-step execution
as first generation.

#### Scenario: Generate a project from a prompt

- **GIVEN** an authenticated user on a new chat in the workbench
- **WHEN** the user submits a natural language description
- **THEN** the assistant response streams into the chat in real time
- **AND** generated files appear in the workspace file tree as they are produced
- **AND** upon completion the preview runs the generated project

#### Scenario: Generation failure

- **GIVEN** the model returns an error or the stream aborts
- **WHEN** generation fails mid-stream
- **THEN** the chat displays an error message with a retry path
- **AND** already-written files remain available in the workspace

#### Scenario: Unauthenticated access

- **GIVEN** an anonymous visitor
- **WHEN** the visitor attempts to open the workbench
- **THEN** the system redirects to the login page with return to the original destination after login

#### Scenario: Planning round precedes first generation

- **GIVEN** the agent mode is set to 多智能体 for a first generation
- **WHEN** the user submits the prompt
- **THEN** the PD planning round runs and the review gate is presented before any file is written
- **AND** after approval the TL orchestrator drives execution one plan step per generation round

#### Scenario: Trivial iteration goes direct

- **GIVEN** a chat that already has messages in multi-agent mode
- **WHEN** the user sends a follow-up message triaged as trivial
- **THEN** no planning round and no orchestration runs

#### Scenario: Major iteration enters the team flow

- **GIVEN** a chat that already has messages in multi-agent mode
- **WHEN** the user sends a follow-up message triaged as major
- **THEN** an incremental planning round and the review gate run before any file is written
- **AND** after approval the TL orchestrator drives execution one plan step per generation round

---

### Requirement: WB-02 Live Preview

**Priority**: P0

The system SHALL run the generated project inside a WebContainer and display a live,
interactive preview that reflects file changes without manual reload.

#### Scenario: Preview boots with the project

- **GIVEN** a chat whose generated project has been written to the workspace
- **WHEN** the preview pane is opened
- **THEN** the WebContainer installs dependencies and starts the dev server
- **AND** the preview shows the running application with working interactions

#### Scenario: Preview follows edits

- **GIVEN** the preview is running
- **WHEN** files change via AI generation or manual editing
- **THEN** the preview reflects the changes without the user re-submitting anything

---

### Requirement: WB-03 Editor and Terminal

**Priority**: P1

The system SHALL provide a code editor with syntax highlighting for workspace files and
an interactive terminal executing commands inside the WebContainer.

#### Scenario: Edit a file manually

- **WHEN** the user opens a file in the editor and saves changes
- **THEN** the change is written to the workspace
- **AND** the preview reflects the change

#### Scenario: Run a command in the terminal

- **WHEN** the user executes a shell command in the terminal pane
- **THEN** the command runs inside the WebContainer and streams its output back

---

### Requirement: WB-04 Diff Review and Revert

**Priority**: P1

The system SHALL let the user review AI-made file changes as diffs and revert an
assistant turn's changes.

#### Scenario: Review changes

- **WHEN** the user opens the diff view for an assistant turn
- **THEN** modified files show before/after differences

#### Scenario: Revert changes

- **WHEN** the user triggers revert on an assistant turn
- **THEN** the workspace files are restored to their state before that turn
- **AND** the preview reflects the restored state

---

### Requirement: WB-05 Iterative Editing

**Priority**: P0

The system SHALL allow users to modify an existing project through follow-up chat
messages; modifications SHALL apply to the current workspace rather than regenerating
from scratch.

#### Scenario: Iterate on an existing project

- **GIVEN** a chat with a completed generation
- **WHEN** the user sends a modification instruction (e.g. "add dark mode toggle")
- **THEN** the assistant modifies the affected files in place
- **AND** the chat history retains both the original and the modification turns

---

### Requirement: WB-06 Server-Side Chat Persistence

**Priority**: P0

The system SHALL persist chats and their messages on the server, associated with the
creating user. Chats SHALL survive page refresh, browser restart, and browser switch
(after login). Browser-local storage SHALL NOT be the system of record. When a chat
is saved, the system SHALL additionally persist a snapshot of the project's current
file tree so that the plaza can reconstruct the project files without parsing message
history.

#### Scenario: Chat survives refresh

- **GIVEN** a user mid-conversation in a chat
- **WHEN** the page is reloaded
- **THEN** the chat list and the full message history are restored from the server

#### Scenario: Chat list scoped to owner

- **WHEN** the chat list loads
- **THEN** only chats created by the logged-in user are shown

#### Scenario: New chat creation is persisted

- **WHEN** the user starts a new chat and submits the first message
- **THEN** a project record is created server-side under the user's account
- **AND** the project title is derived from the chat description

#### Scenario: File snapshot persisted on save

- **WHEN** a chat is saved server-side
- **THEN** the current workspace file tree is serialized and stored with the project
- **AND** the snapshot reflects the latest workspace files at save time

---

### Requirement: WB-07 My Projects Management

**Priority**: P1

The system SHALL provide a "我的项目" page (route `/my-projects`) listing the current
user's projects as cards sorted by update time descending, and allow the owner to open
or delete a project. UI copy on this page SHALL be Chinese, using "项目" for the
generated artifact. When the user opens an existing project, the system SHALL restore
the project's file tree from the stored `fileSnapshot` into the WebContainer so that
the Files panel displays the project's source files.

#### Scenario: List own projects

- **WHEN** a logged-in user opens `/my-projects`
- **THEN** the page shows their projects as cards with title, placeholder thumbnail, and time
- **AND** cards are sorted by `updatedAt` descending

#### Scenario: Empty state

- **WHEN** the user has no projects
- **THEN** the page shows a Chinese prompt with a link to start a new chat

#### Scenario: Open a project

- **WHEN** the user clicks a project card
- **THEN** the workbench opens that project's chat with history restored
- **AND** the file tree from the project's `fileSnapshot` is written into the WebContainer
- **AND** the Files panel displays the restored file tree

#### Scenario: Open a project without fileSnapshot

- **WHEN** the user opens a project that has no `fileSnapshot` (legacy or empty project)
- **THEN** the workbench opens the chat with history restored
- **AND** the Files panel remains empty (graceful degradation, no error shown)

#### Scenario: Delete with confirmation

- **WHEN** the owner activates delete on a project
- **THEN** a confirmation popover requires a second affirmative click
- **AND** on confirm the project and its messages are removed server-side
- **AND** cancelling issues no request

---

### Requirement: WB-08 Access Protection

**Priority**: P0

The system SHALL protect workbench and project routes so that only authenticated owners
can access their projects.

#### Scenario: Non-owner project access

- **GIVEN** a visitor (anonymous or a different user) requests another user's project
- **WHEN** the project exists but belongs to someone else
- **THEN** the system responds with 404 (no information leakage about existence)

#### Scenario: Anonymous workbench access

- **WHEN** an anonymous user navigates to the workbench or project routes
- **THEN** the system redirects to the login page

---

### Requirement: WB-09 Response Observability

**Priority**: P1

The system SHALL present staged request status and time statistics for every chat
request in the workbench, so the user can distinguish waiting, thinking, streaming, finished,
and failed states at any moment. Time statistics SHALL be recorded server-side,
attached to the assistant message as an annotation, and persisted with the message
so they remain visible after reload. UI copy SHALL be in Chinese.

#### Scenario: Waiting phase feedback

- **WHEN** the user submits a message and the server has not yet produced visible assistant text or reasoning
- **THEN** the chat displays a waiting indicator with a live elapsed-time counter
- **AND** the indicator remains visible until the first reasoning token or answer text arrives or the request fails

#### Scenario: Thinking phase feedback

- **WHEN** the model begins emitting reasoning tokens (reasoning annotations arrive at the client)
- **THEN** the chat displays a "思考中" indicator with a live elapsed-time counter starting from request submission
- **AND** the reasoning panel expands to show streaming reasoning text
- **AND** the indicator transitions to "streaming" when the first answer content token arrives

#### Scenario: Streaming phase feedback

- **WHEN** visible assistant answer text begins streaming (after reasoning, if any)
- **THEN** the chat displays elapsed time, generated token count, and generation speed (tokens per second), updated while streaming

#### Scenario: Completion statistics

- **WHEN** a chat request completes successfully
- **THEN** the assistant message displays a statistics line with token counts, time to first reasoning token (if reasoning was produced), time to first visible token, total elapsed time, and generation speed
- **AND** the same statistics remain visible when the conversation is reopened or reloaded

#### Scenario: First visible token definition

- **WHEN** the upstream model emits reasoning tokens before content tokens
- **THEN** time to first visible token SHALL be measured from request start to the first content token rendered to the user, not the first transported chunk
- **AND** time to first reasoning token SHALL be measured from request start to the first reasoning token rendered to the user

#### Scenario: Continuation segments

- **WHEN** a request is completed through multiple continuation segments due to output length limits
- **THEN** the statistics SHALL report the number of segments, and total elapsed time SHALL cover all segments

#### Scenario: Failure recorded in message history

- **WHEN** a chat request fails at any stage
- **THEN** the failure is shown inline at the assistant message position with the error summary
- **AND** the failure state is persisted with the message so it is visible after reload

---

### Requirement: WB-10 Public Visibility Toggle

**Priority**: P1

The system SHALL allow the owner of a project to publish it to the plaza or
withdraw it, via an owner-only toggle. Publishing SHALL require a file
snapshot to exist; if none exists, the system SHALL reject the publish with a
Chinese guidance message. Withdrawal SHALL immediately remove the project
from the plaza and block visitor access.

#### Scenario: Owner publishes a project

- **GIVEN** an owner with a project that has a file snapshot
- **WHEN** the owner activates the publish toggle
- **THEN** the project becomes public and appears in the plaza

#### Scenario: Publish blocked without snapshot

- **GIVEN** an owner with a project that has no file snapshot
- **WHEN** the owner attempts to publish
- **THEN** the system rejects the publish with a Chinese guidance message
- **AND** the project remains private

#### Scenario: Owner withdraws a project

- **GIVEN** a public project
- **WHEN** the owner deactivates the publish toggle
- **THEN** the project is removed from the plaza immediately
- **AND** visitor requests to its public detail view return 404

#### Scenario: Non-owner cannot toggle

- **WHEN** a non-owner (or anonymous visitor) attempts to change a project's visibility
- **THEN** the system rejects the request

---

### Requirement: WB-11 Generation Round Telemetry Collection

**Priority**: P1

The system SHALL collect per-round telemetry for every chat generation round, covering: the time from sending the user message to the first visible token, the LLM streaming duration, every executed action (type, command summary, start time, duration, terminal status), the time from the start command to the preview port becoming ready, and the tail duration between stream end and completion of all queued actions. Rounds triggered by live streaming SHALL be marked as fresh; rounds re-executed from persisted message history after a page load or project re-open SHALL be marked as replay. Telemetry collection SHALL NOT alter generation, execution, or preview behavior, and SHALL add no user-visible overhead when the display panel is disabled.

#### Scenario: Fresh round records the full timeline

- **WHEN** a user sends a prompt and the assistant response streams, executes file/shell/start actions, and the preview port opens
- **THEN** the round's telemetry contains the wait, stream, per-action, start-to-preview, and tail timings, marked as source "fresh"

#### Scenario: Replayed round is marked separately

- **WHEN** a historical project is opened and its message history is re-parsed, causing actions to re-execute
- **THEN** the resulting telemetry rounds are marked as source "replay" and do not overwrite the persisted telemetry of the original fresh rounds

#### Scenario: Collection is behavior-neutral

- **WHEN** telemetry collection is active
- **THEN** action execution order, file writing, preview behavior, and persisted chat content remain identical to the pre-telemetry behavior

---

### Requirement: WB-12 Generation Interruption Event Recording

**Priority**: P1

The system SHALL record interruption events on the affected generation round, including: LLM request failure, user-initiated abort, termination caused by the response segment limit, and a response stream that ends while an artifact or action remains unclosed. Each recorded event SHALL carry its kind and timestamp within the round timeline.

#### Scenario: Stream ends with an unclosed artifact

- **WHEN** the response stream terminates before the artifact's closing tag is received
- **THEN** the round's telemetry records an unclosed-artifact interruption with its timestamp

#### Scenario: User aborts mid-generation

- **WHEN** the user stops a generation that is streaming or executing actions
- **THEN** the round's telemetry records an abort interruption and the round is finalized with the data collected so far

---

### Requirement: WB-13 Telemetry Persistence as Message Annotations

**Priority**: P1

The system SHALL persist the telemetry of each fresh round as an annotation attached to the corresponding assistant message through the existing message persistence channel, after the round is finalized. Telemetry annotations SHALL be additive and versioned; clients that do not understand the annotation SHALL ignore it without error. Replay rounds SHALL NOT be persisted.

#### Scenario: Telemetry survives reload

- **WHEN** a generation round has finalized and the project is reopened
- **THEN** the round's telemetry annotation is loaded together with the message history

#### Scenario: Oversized telemetry degrades gracefully

- **WHEN** a round's telemetry would exceed the defined size cap
- **THEN** the system drops the least essential fields to fit the cap instead of failing the persistence of the message

---

### Requirement: WB-14 Telemetry Panel Gating

**Priority**: P2

The system SHALL provide a telemetry visualization panel that is disabled by default and controlled by a feature flag overridable via environment configuration. When disabled, the panel SHALL NOT render and SHALL NOT be discoverable by end users. When enabled, the panel SHALL render per-round timelines for recent fresh and replay rounds of the current session, including persisted telemetry of loaded messages.

#### Scenario: Panel hidden by default

- **WHEN** the telemetry feature flag is not enabled
- **THEN** no telemetry panel or entry point is rendered in the chat UI

#### Scenario: Panel shows fresh and replay rounds

- **WHEN** the telemetry feature flag is enabled and rounds have been collected
- **THEN** the panel displays each round's timeline segments (wait, stream, actions, preview) and interruption markers, distinguishing fresh from replay rounds

### Requirement: WB-15 Replay Snapshot Restore

**Priority**: P0

The system SHALL cache a snapshot of the WebContainer workspace after a generation round completes a dependency install successfully, and SHALL restore that snapshot when the same project is re-opened (replay) instead of re-executing file writes and the install command. A snapshot SHALL be associated with the content of the project's `package.json` at install time; a replay SHALL use the cached snapshot only when the association matches the current project's `package.json`. A restore SHALL repair executable permissions on restored `node_modules/.bin` entries before any start action runs. When no matching snapshot exists, when the snapshot cannot be restored, or when the restored workspace fails to start the dev server, the system SHALL fall back to the full replay path (file re-execution plus install) without user-visible failure. A snapshot-restored replay SHALL produce the same workspace state and preview outcome as a full replay.

#### Scenario: Cache hit skips install on project re-open

- **WHEN** a user re-opens a previously generated project whose `package.json` matches a cached snapshot
- **THEN** the replay restores the workspace from the snapshot, skips the install command entirely, starts the dev server, and the preview becomes available

#### Scenario: Dependency change invalidates the cache

- **WHEN** a replay's `package.json` content differs from the snapshot's recorded association
- **THEN** the replay ignores the snapshot and runs the full replay path including install

#### Scenario: Restore failure falls back silently

- **WHEN** the snapshot restore throws, or the dev server fails to start after restore
- **THEN** the system re-runs the full replay path (file re-execution plus install) and the user sees the same end state as an uncached replay, with no error surfaced

#### Scenario: Post-snapshot edits are preserved

- **WHEN** a project has rounds after the cached snapshot was taken that modify files
- **THEN** the replay applies those later file changes on top of the restored snapshot, so the final workspace matches a full round-by-round replay

#### Scenario: Restore is observable in telemetry

- **WHEN** a replay round restores from a snapshot
- **THEN** the round's telemetry records the restore outcome (hit or miss, restore duration) and remains compatible with rounds that have no install action

### Requirement: WB-16 Snapshot Cache Write-Back and Governance

**Priority**: P1

The system SHALL write snapshots back asynchronously after the preview of the installing round has opened, so write-back never delays the user-perceived generation path. Snapshot storage SHALL live entirely in the browser (no server upload, no network request) and SHALL be bounded by total size with least-recently-used eviction. Losing the cache (browser data cleared, new device) SHALL only result in a cold install, never in an error.

#### Scenario: Write-back does not delay the user

- **WHEN** an install completes and the preview opens
- **THEN** the snapshot write-back runs afterwards in the background and does not extend the time to preview

#### Scenario: Cache size is bounded

- **WHEN** the total stored snapshot size exceeds the configured limit
- **THEN** the least recently used snapshots are evicted until the total is within the limit

#### Scenario: Cleared cache degrades gracefully

- **WHEN** the user clears browser site data and re-opens a project
- **THEN** the replay runs the full path with a fresh install and succeeds, and a new snapshot is written back after the preview opens

---

### Requirement: WB-17 Planning Phase Observability

**Priority**: P1

The system SHALL extend the staged request status feedback with a planning phase: while
a planning round streams, the chat SHALL display a Chinese "PD 正在规划" indicator with
a live elapsed-time counter, and plan steps SHALL render incrementally as they arrive.
Timing statistics SHALL distinguish planning rounds from execution rounds so that
first-token metrics of each phase are not mixed. Planning-phase statistics SHALL follow
the same persistence rules as other response statistics.

#### Scenario: Planning phase indicator

- **WHEN** a planning round streams after the user submits a prompt that enters planning
  (a first generation or a major iteration change)
- **THEN** the chat shows a "PD 正在规划" status with a live elapsed-time counter
- **AND** plan steps appear incrementally as they stream

#### Scenario: Phase-separated timing

- **WHEN** a first generation completes with a planning round followed by execution rounds
- **THEN** the timing statistics report the planning and execution phases separately
- **AND** each phase's first-token timing is measured from its own round start

---

### Requirement: WB-18 TL Execution Progress Observability

**Priority**: P1

While TL orchestration drives execution rounds, the request status feedback and timing
statistics SHALL attribute each execution round to its plan step so per-step timing is
observable. Execution-round statistics SHALL carry the step index and follow the same
persistence rules as other response statistics. The statistics display SHALL keep
planning, per-step execution, and legacy single-agent rounds distinguishable. Assistant
chat cards SHALL display which agent produced them (PD / TL / 工程师 · 步骤 N), derived
from persisted message annotations so the attribution survives reload.

#### Scenario: Step-attributed round statistics

- **WHEN** an orchestrated execution round for step i completes
- **THEN** its timing statistics are recorded with phase execution and step index i
- **AND** they persist with the round's assistant message

#### Scenario: Panel and statistics stay consistent

- **WHEN** orchestration advances from step i to step i+1
- **THEN** the progress panel and the per-round statistics both reflect the step transition

#### Scenario: Agent attribution survives reload

- **WHEN** a project with orchestrated history is reopened
- **THEN** each assistant card still shows its producing agent (PD / TL / 工程师 · 步骤 N)
