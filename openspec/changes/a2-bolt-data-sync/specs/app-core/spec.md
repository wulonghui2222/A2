## MODIFIED Requirements

### Requirement: FR-05 Project Management

**Priority**: P1

The system SHALL provide a "My Projects" page (`/my-projects`) displaying the current
user's projects as a card grid, and a project detail page (`/projects/:id`). An
**owner** landing on `/projects/:id` SHALL be redirected to `/workbench/:id` (the live
workbench where editing happens); the read-only detail view (preview, source, session
history) SHALL remain for public/gallery viewers. Owner management actions (rename,
delete, public toggle) SHALL remain available from the My-Projects page and the
workbench header.

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

#### Scenario: Owner redirected to the workbench

- **GIVEN** the authenticated owner navigates to `/projects/:id` (e.g. by clicking a card on `/my-projects`)
- **WHEN** the page loads
- **THEN** the system redirects the owner to `/workbench/:id`
- **AND** the workbench resumes the project's bolt chat (via `workbenchChatId`) or starts a new one

#### Scenario: View read-only detail (public viewer)

- **GIVEN** a visitor (anonymous or a different user) navigates to `/projects/:id` for a public project
- **WHEN** the page loads
- **THEN** the system renders the project with three tabs: a live preview (sandboxed iframe of the persisted artifact), a source-code view (syntax-highlighted), and a session-history view
- **AND** the session-history view shows the bolt conversation turns mirrored via the workbench seam (WE-07), in chronological order, for bolt-generated projects; legacy projects show their earlier PM / Architect / Engineer messages
- **AND** the preview tab is selected by default

#### Scenario: Unauthorized detail access

- **GIVEN** a visitor (anonymous or logged-in as a different user) navigates to `/projects/:id`
- **WHEN** the project does not exist OR the visitor is not its owner AND the project is not public
- **THEN** the system responds with a 404 (no information leakage about existence)

#### Scenario: Rename project

- **GIVEN** the authenticated owner submits a new title via `PATCH /api/projects/:id`
- **WHEN** the title is non-empty and within length bounds
- **THEN** the system updates the project's title
- **AND** responds with the updated project metadata

#### Scenario: Delete project

- **GIVEN** the authenticated owner confirms deletion on a project
- **WHEN** `DELETE /api/projects/:id` is received
- **THEN** the project, its sessions, and all associated messages are removed from the database
- **AND** the system redirects (or the client navigates) to `/my-projects`

#### Scenario: Delete confirmation

- **GIVEN** the owner hovers or focuses a project card on `/my-projects` or views the workbench for a project
- **WHEN** the owner activates the delete action
- **THEN** the system presents a confirmation popover requiring a second affirmative click before issuing the delete request
- **AND** cancelling the popover does not issue any request
