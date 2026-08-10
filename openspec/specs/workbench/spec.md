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
request in the workbench, so the user can distinguish waiting, streaming, finished,
and failed states at any moment. Time statistics SHALL be recorded server-side,
attached to the assistant message as an annotation, and persisted with the message
so they remain visible after reload. UI copy SHALL be in Chinese.

#### Scenario: Waiting phase feedback

- **WHEN** the user submits a message and the server has not yet produced visible assistant text
- **THEN** the chat displays a waiting indicator with a live elapsed-time counter
- **AND** the indicator remains visible until the first visible text arrives or the request fails

#### Scenario: Streaming phase feedback

- **WHEN** visible assistant text begins streaming
- **THEN** the chat displays elapsed time, generated token count, and generation speed (tokens per second), updated while streaming

#### Scenario: Completion statistics

- **WHEN** a chat request completes successfully
- **THEN** the assistant message displays a statistics line with token counts, time to first visible token, total elapsed time, and generation speed
- **AND** the same statistics remain visible when the conversation is reopened or reloaded

#### Scenario: First visible token definition

- **WHEN** the upstream model emits reasoning tokens before content tokens
- **THEN** time to first visible token SHALL be measured from request start to the first content token rendered to the user, not the first transported chunk

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
