## MODIFIED Requirements

### Requirement: FR-05 Project Management

**Priority**: P1

The system SHALL provide a "My Projects" page (`/my-projects`) displaying the current
user's projects as a card grid, and a project detail page (`/projects/:id`) that
allows the project owner to preview, inspect, rename, and delete a project.

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

#### Scenario: View project detail

- **GIVEN** the authenticated owner navigates to `/projects/:id`
- **WHEN** the page loads
- **THEN** the system renders the project with three tabs: a live preview (sandboxed iframe of the generated app), a source-code view (syntax-highlighted), and a session-history view (PM / Architect / Engineer messages in chronological order)
- **AND** the preview tab is selected by default
- **AND** clicking a project card on `/my-projects` opens this page

#### Scenario: Unauthorized detail access

- **GIVEN** a visitor (anonymous or logged-in as a different user) navigates to `/projects/:id`
- **WHEN** the project does not exist OR the visitor is not its owner
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

- **GIVEN** the owner hovers or focuses a project card or views the detail page
- **WHEN** the owner activates the delete action
- **THEN** the system presents a confirmation popover requiring a second affirmative click before issuing the delete request
- **AND** cancelling the popover does not issue any request
