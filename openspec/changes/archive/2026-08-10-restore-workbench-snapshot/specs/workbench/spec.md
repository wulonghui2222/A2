## MODIFIED Requirements

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
