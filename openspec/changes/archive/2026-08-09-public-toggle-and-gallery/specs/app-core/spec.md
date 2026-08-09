## MODIFIED Requirements

### Requirement: FR-05 Project Management

**Priority**: P1

The system SHALL provide a "My Projects" page (`/my-projects`) displaying the current
user's projects as a card grid, and a project detail page (`/projects/:id`) that
allows the project owner to preview, inspect, rename, delete, and control visibility
of a project. Non-owners MAY view a read-only version of public projects.

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

#### Scenario: View project detail (owner)

- **GIVEN** the authenticated owner navigates to `/projects/:id`
- **WHEN** the page loads
- **THEN** the system renders the project with three tabs: a live preview (sandboxed iframe of the generated app), a source-code view (syntax-highlighted), and a session-history view (PM / Architect / Engineer messages in chronological order)
- **AND** the preview tab is selected by default
- **AND** clicking a project card on `/my-projects` opens this page
- **AND** the owner sees full controls: delete button, rename capability, and public/private toggle

#### Scenario: View project detail (non-owner, public)

- **GIVEN** a visitor (anonymous or logged-in as a different user) navigates to `/projects/:id`
- **WHEN** the project exists AND `isPublic === true`
- **THEN** the system renders a read-only version of the detail page (preview, code, sessions tabs)
- **AND** no action buttons (delete, rename, toggle) are visible
- **AND** the visitor's page load increments the project's `viewCount`

#### Scenario: Unauthorized detail access

- **GIVEN** a visitor (anonymous or logged-in as a different user) navigates to `/projects/:id`
- **WHEN** the project does not exist OR `isPublic === false` (and visitor is not the owner)
- **THEN** the system responds with a 404 (no information leakage about existence)

#### Scenario: Rename project

- **GIVEN** the authenticated owner submits a new title via `PATCH /api/projects/:id`
- **WHEN** the title is non-empty and within length bounds
- **THEN** the system updates the project's title
- **AND** responds with the updated project metadata

#### Scenario: Toggle public visibility

- **GIVEN** the authenticated owner submits `{ isPublic: boolean }` via `PATCH /api/projects/:id`
- **WHEN** `isPublic` is set to `true` AND the project `status === "completed"`
- **THEN** the system updates the project's visibility
- **AND** responds with the updated project metadata

#### Scenario: Toggle public visibility (incomplete project)

- **GIVEN** the authenticated owner submits `{ isPublic: true }` via `PATCH /api/projects/:id`
- **WHEN** the project `status` is NOT `"completed"`
- **THEN** the system responds with 400 `CANNOT_PUBLISH_INCOMPLETE`

#### Scenario: View count increment

- **GIVEN** any visitor opens a public project's detail page
- **WHEN** the page loads successfully
- **THEN** the project's `viewCount` is incremented by 1
- **AND** the owner's own visits also count toward the total

#### Scenario: Delete project

- **GIVEN** the authenticated owner confirms deletion on a project
- **WHEN** `DELETE /api/projects/:id` is received
- **THEN** the project, its sessions, and all associated messages are removed from the database
- **AND** the system redirects (or the client navigates) to `/my-projects`

#### Scenario: Delete confirmation

- **GIVEN** the owner hovers or focuses a project card or views the detail page
- **WHEN** the owner activates the delete action
- **THEN** the system presents a confirmation popover requiring a second affirmative click before issuing the delete request
- **AND** cancelling the popover does not issue any request

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

#### Scenario: PM agent outputs tags

- **GIVEN** the PM Agent completes requirement analysis
- **WHEN** the pipeline saves the project
- **THEN** the project record SHALL include a `tags` field containing an array of auto-generated category tags (e.g. `["游戏", "工具"]`)
- **AND** existing projects without tags SHALL have an empty array `[]`

**Agent Roles**:

| Agent | Responsibility | Input | Output |
|-------|---------------|-------|--------|
| PM Agent | Requirement analysis + tag generation | User prompt | Structured requirement JSON + tags[] |
| Architect Agent | Page structure & component design | Requirement spec | Architecture JSON |
| Engineer Agent | Code generation | Architecture | Runnable HTML/CSS/JS |
