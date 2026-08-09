# Delta for App Core

## MODIFIED Requirements

### Requirement: FR-01 Application Generation

**Priority**: P0

The system SHALL allow **authenticated** users to generate a Web application by entering
a natural language description. The system SHALL invoke LLM-powered agents to produce
runnable code and render it as a live preview. Unauthenticated users SHALL be prompted
to log in before generation.

#### Scenario: User generates an app from a prompt

- **GIVEN** an authenticated user on the home page
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

#### Scenario: Unauthenticated user attempts generation

- **GIVEN** an anonymous user on the home page
- **WHEN** the user enters a prompt and clicks "Generate"
- **THEN** the system redirects to `/login?callbackUrl=/`
- **AND** after login, the user returns to the home page

**API**: `POST /api/generate`
```
Request:  { prompt: string, sessionId?: string, model?: string }
Response: { sessionId, projectId, status, previewUrl, messages[] }
```

**API**: `GET /api/generate/:sessionId/status`
```
Response: { status, progress (0-100), messages[], previewUrl? }
```

---

### Requirement: FR-04 Data Persistence

**Priority**: P0

The system SHALL persist all user project data, including project metadata, generated code,
and session message history. Each project SHALL be associated with its creating user.

#### Scenario: Auto-save on completion

- **GIVEN** a generation status transitions to "completed"
- **WHEN** the generation finishes
- **THEN** project data (metadata + code + message history) is written to the database
- **AND** the project record includes the creating user's `userId`
- **AND** the project appears in the user's "My Projects" list

#### Scenario: Browse historical projects

- **GIVEN** the user has previously generated projects
- **WHEN** the user opens the "My Projects" page
- **THEN** only their own projects are listed, sorted by update time descending
- **AND** clicking a project opens its detail and preview

---

### Requirement: FR-05 Project Management

**Priority**: P1

The system SHALL provide a "My Projects" page (`/my-projects`) displaying the current
user's projects as a card grid.

#### Scenario: Project list display

- **GIVEN** the user navigates to `/my-projects`
- **WHEN** the page loads
- **THEN** projects are displayed as a card grid
- **AND** each card shows title, thumbnail (or placeholder), and creation time
- **AND** cards are sorted by `updatedAt` descending

#### Scenario: Project search

- **GIVEN** the user types in the search box
- **WHEN** the input changes
- **THEN** the project list filters in real time to match the query (by title or content)

#### Scenario: Delete project

- **GIVEN** the user selects a project for deletion
- **WHEN** the user confirms the delete action
- **THEN** the project and its associated data are removed from the database
