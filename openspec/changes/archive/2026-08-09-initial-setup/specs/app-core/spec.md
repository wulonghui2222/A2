# Delta for App Core

## ADDED Requirements

### Requirement: FR-01 Application Generation

**Priority**: P0

The system SHALL allow users to generate a Web application by entering a natural language
description. The system SHALL invoke LLM-powered agents to produce runnable code and render
it as a live preview.

#### Scenario: User generates an app from a prompt

- **GIVEN** a user on the home page
- **WHEN** the user enters a natural language description and clicks "Generate" or presses Enter
- **THEN** the system displays generation progress (agent messages)
- **AND** a live, interactive preview of the generated app is shown upon completion
- **AND** the preview contains at least one interactive element (button, form, or navigation)

#### Scenario: Generation failure

- **GIVEN** the user entered a vague or invalid prompt
- **WHEN** the AI cannot produce a valid application
- **THEN** the system displays a friendly error message with suggestions to retry or refine

#### Scenario: Continuation from existing session

- **GIVEN** a user has a previous session ID
- **WHEN** the user provides `sessionId` in the generate request
- **THEN** the system resumes generation within the existing session context

---

### Requirement: FR-02 Multi-Agent Collaboration

**Priority**: P1

The system SHALL simulate a multi-agent team that works in defined roles (PM → Architect → Engineer)
during the generation process, displaying each agent's status and output to the user.

#### Scenario: Sequential agent workflow

- **GIVEN** a generation has started
- **WHEN** the pipeline progresses
- **THEN** the UI displays PM Agent → Architect Agent → Engineer Agent messages in order
- **AND** each agent message includes a role label, avatar, and output summary

#### Scenario: Human-in-the-Loop approval

- **GIVEN** the PM Agent has completed requirement analysis
- **WHEN** the system presents the requirement summary for confirmation
- **THEN** the user may confirm to continue or edit the requirements
- **AND** after confirmation, the workflow proceeds to the next agent

---

### Requirement: FR-03 Application Preview

**Priority**: P0

The system SHALL render the generated application in a sandboxed iframe, supporting real
user interaction and responsive viewport switching.

#### Scenario: View live preview

- **GIVEN** a project whose generation status is "completed"
- **WHEN** the user opens the project detail page
- **THEN** the preview area renders the app in an `<iframe sandbox="allow-scripts allow-forms">`
- **AND** the preview supports click and input interactions
- **AND** the user can switch between desktop / tablet / phone viewports

#### Scenario: Preview auto-refresh on iteration

- **GIVEN** the user has triggered a modification (regeneration or iteration)
- **WHEN** the modification completes
- **THEN** the preview area automatically refreshes to show the latest version

---

### Requirement: FR-04 Data Persistence

**Priority**: P0

The system SHALL persist all user project data, including project metadata, generated code,
and session message history.

#### Scenario: Auto-save on completion

- **GIVEN** a generation status transitions to "completed"
- **WHEN** the generation finishes
- **THEN** project data (metadata + code + message history) is written to the database
- **AND** the project appears in the user's project list

#### Scenario: Browse historical projects

- **GIVEN** the user has previously generated projects
- **WHEN** the user opens the "My Projects" page
- **THEN** all historical projects are listed, sorted by update time descending
- **AND** clicking a project opens its detail and preview

---

### Requirement: FR-05 Project Management

**Priority**: P1

The system SHALL provide project list management, including search, sort, and delete.

#### Scenario: Project list display

- **GIVEN** the user navigates to "My Projects"
- **WHEN** the page loads
- **THEN** projects are displayed as a card grid
- **AND** each card shows title, description, thumbnail, and last-updated time
- **AND** supports sort by time or name

#### Scenario: Project search

- **GIVEN** the user types in the search box
- **WHEN** the input changes
- **THEN** the project list filters in real time to match the query (by title or content)

#### Scenario: Delete project

- **GIVEN** the user selects a project for deletion
- **WHEN** the user confirms the delete action
- **THEN** the project and its associated data are removed from the database

---

### Requirement: FR-06 Template System

**Priority**: P2

The system SHALL provide preset templates that users can use as starting points,
and support Remix of public projects.

#### Scenario: Create from template

- **GIVEN** the user sees the template recommendation area on the home page
- **WHEN** the user clicks a template
- **THEN** the system pre-fills the input with the template's prompt
- **AND** the user may edit or generate directly

#### Scenario: Remix a public project

- **GIVEN** the user is browsing the project gallery
- **WHEN** the user clicks "Remix" on a public project
- **THEN** the system copies the project's prompt and code into a new session
- **AND** the user can continue editing from there

---

### Requirement: FR-07 Project Gallery

**Priority**: P2

The system SHALL provide a public project showcase page where visitors can browse
and experience projects created by others.

#### Scenario: Browse the gallery

- **GIVEN** a user visits the gallery page
- **WHEN** the page loads
- **THEN** all public projects are displayed, sorted by popularity
- **AND** projects can be filtered by tag or category
- **AND** each project card supports click-to-preview without login

---

### Requirement: FR-08 Iterative Editing

**Priority**: P2

The system SHALL allow users to modify a generated project through conversational
instructions, with changes reflected in the preview.

#### Scenario: Iterate on a project

- **GIVEN** the user is on a project detail page
- **WHEN** the user enters a modification instruction (e.g., "add dark mode toggle")
- **THEN** the AI modifies the current code based on the instruction
- **AND** the preview refreshes to show the updated result
- **AND** the modification is recorded in the session messages

#### Scenario: View source code

- **GIVEN** the user is on a project detail page
- **WHEN** the user clicks the "Code" tab
- **THEN** the current source code is displayed with syntax highlighting
- **AND** the code can be copied

---

### Requirement: NFR-01 Performance

**Priority**: P1

| Metric | Target |
|--------|--------|
| First contentful paint (LCP) | < 3s |
| AI generation response time | < 60s |
| Preview render time | < 2s |
| API response time (non-generation) | < 500ms |

### Requirement: NFR-02 Usability

**Priority**: P1

- All interactive elements SHALL provide visual feedback within 200ms
- Generation process SHALL display clear loading state and progress indicators
- Error scenarios SHALL present friendly error messages with recovery paths

### Requirement: NFR-03 Security

**Priority**: P1

- User input SHALL be sanitized before rendering (XSS prevention)
- Generated code SHALL run inside iframe sandbox
- API routes SHALL enforce rate limiting

### Requirement: NFR-04 Deployability

**Priority**: P0

- Application SHALL support one-click deploy to Vercel
- Build artifact SHALL be < 50MB

### Requirement: NFR-05 Extensibility

**Priority**: P2

- Agent roles SHALL be pluggable via modular architecture
- LLM service layer SHALL support model switching
- Data layer SHALL support SQLite → PostgreSQL migration
