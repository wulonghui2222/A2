## MODIFIED Requirements

### Requirement: FR-01 Application Generation

**Priority**: P0

The system SHALL allow **authenticated** users to generate a Web application by entering
a natural language description. Generation SHALL execute inside the embedded bolt
workbench (client-side, WebContainer); the A2 server SHALL create the Project record
and route the user to the workbench. Unauthenticated users SHALL be prompted to log in
before generation.

#### Scenario: User generates an app from a prompt

- **GIVEN** an authenticated user on the home page
- **WHEN** the user enters a natural language description and clicks "Generate" or presses Enter
- **THEN** the system creates a Project record (status `generating`) and navigates to `/workbench/:projectId`
- **AND** the workbench receives the prompt via the seam handshake and starts generation automatically (see `workbench-embed` WE-03)
- **AND** a live, interactive preview of the generated app is visible inside the workbench's WebContainer preview
- **AND** after the user saves, the persisted artifact contains at least one interactive element (button, form, or navigation)

#### Scenario: Generation failure

- **GIVEN** the user entered a vague or invalid prompt
- **WHEN** the workbench cannot produce a valid application
- **THEN** the workbench displays its own error/feedback in the chat stream
- **AND** the user can retry or refine the prompt inside the workbench

#### Scenario: Unauthenticated user attempts generation

- **GIVEN** an anonymous user on the home page
- **WHEN** the user enters a prompt and clicks "Generate"
- **THEN** the system redirects to `/login?callbackUrl=/`
- **AND** after login, the user returns to the home page

**API**: `POST /api/projects`
```
Request:  { prompt: string, model?: string }
Response: { projectId, status }
```
The former `POST /api/generate` and `GET /api/generate/:sessionId/status` endpoints
are removed; generation no longer runs on the A2 server.

---

### Requirement: FR-03 Application Preview

**Priority**: P0

The system SHALL provide two preview surfaces: the **live** WebContainer preview inside
the workbench during generation/iteration, and the **persisted artifact** preview in a
sandboxed iframe on the project detail page, supporting real user interaction and
responsive viewport switching.

#### Scenario: Live preview during generation

- **GIVEN** the user is in the workbench for a project
- **WHEN** the workbench generates or modifies code
- **THEN** bolt's WebContainer preview renders the running app live (dev-server preview)
- **AND** runtime errors surface through bolt's own error reporting

#### Scenario: View persisted preview

- **GIVEN** a project whose status is `completed` with a saved artifact
- **WHEN** the user opens the project detail page
- **THEN** the preview area renders the artifact entry document in an `<iframe sandbox="allow-scripts allow-forms">`
- **AND** the preview supports click and input interactions
- **AND** the user can switch between desktop / tablet / phone viewports
- **AND** the existing toolbar (refresh, open-in-new-tab, error banner) remains available

---

### Requirement: FR-04 Data Persistence

**Priority**: P0

The system SHALL persist all user project data, including project metadata, the exported
artifact file tree, and the flattened entry document. Each project SHALL be associated
with its creating user.

#### Scenario: Save on workbench export

- **GIVEN** the user triggers a save from the workbench
- **WHEN** the artifact reaches A2
- **THEN** the dist file tree is stored in `Project.files` (JSON)
- **AND** `Project.code` is set to the `index.html` entry content (null-safe fallback keeps legacy projects readable)
- **AND** status becomes `completed`, `updatedAt` is bumped
- **AND** the project appears (updated) in the user's "My Projects" list

#### Scenario: Browse historical projects

- **GIVEN** the user has previously generated projects
- **WHEN** the user opens the "My Projects" page
- **THEN** only their own projects are listed, sorted by update time descending
- **AND** clicking a project opens its detail and preview

---

### Requirement: FR-08 Iterative Editing

**Priority**: P1

The system SHALL allow users to modify a generated project through conversational
instructions **inside the bolt workbench**, with changes reflected in the live preview
and persistable via the save flow.

#### Scenario: Iterate on a project

- **GIVEN** the user is in the workbench for an existing project
- **WHEN** the user enters a modification instruction in bolt's chat (e.g., "add dark mode toggle")
- **THEN** bolt modifies the project files and the WebContainer preview updates live
- **AND** the user can save the new artifact, replacing `Project.files` / `Project.code`

#### Scenario: View source code

- **GIVEN** the user is on a project detail page
- **WHEN** the user clicks the "Code" tab
- **THEN** the persisted entry document (`Project.code`) is displayed with syntax highlighting
- **AND** the code can be copied

The A2-side iteration pipeline (`POST /api/generate` dispatch, `runIterationPipeline`)
is removed; iteration is bolt's native chat loop.

## REMOVED Requirements

### Requirement: FR-02 Multi-Agent Collaboration

**Reason**: Multi-agent orchestration (PM → Architect → Engineer) is abandoned per the
Shape B exploration decision — bolt is a single-conversation flow; maintaining a
parallel server pipeline adds cost without user-facing value.

**Migration**: Existing `Session` / `AgentMessage` rows remain readable in the
database; the detail page session-history tab is retired with the pipeline.
