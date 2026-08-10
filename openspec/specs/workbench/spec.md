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
(after login). Browser-local storage SHALL NOT be the system of record.

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

---

### Requirement: WB-07 My Projects Management

**Priority**: P1

The system SHALL provide a "我的项目" page (route `/my-projects`) listing the current
user's projects as cards sorted by update time descending, and allow the owner to open
or delete a project. UI copy on this page SHALL be Chinese, using "项目" for the
generated artifact.

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
