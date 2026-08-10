## ADDED Requirements

### Requirement: WE-01 Workbench Route & Isolation Contract

**Priority**: P0

The system SHALL serve a workbench page at `/workbench/:projectId` that embeds the
bolt fork workbench (origin from `WORKBENCH_ORIGIN`) in an iframe with
`allow="cross-origin-isolated"`. The route SHALL respond with
`Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`;
no other route SHALL carry these headers. The page SHALL load no cross-origin
resources other than the workbench iframe.

#### Scenario: Owner opens the workbench

- **GIVEN** the authenticated owner of a project
- **WHEN** they navigate to `/workbench/:projectId`
- **THEN** the page returns 200 with COEP/COOP headers
- **AND** the bolt fork loads inside the iframe and becomes cross-origin-isolated via delegation
- **AND** WebContainer boots inside the embedded workbench

#### Scenario: Non-owner or anonymous access

- **GIVEN** an anonymous visitor or a user who does not own the project
- **WHEN** they navigate to `/workbench/:projectId`
- **THEN** the system responds with 404 (matching `/projects/:id` semantics)

#### Scenario: Workbench origin unreachable

- **GIVEN** `WORKBENCH_ORIGIN` does not respond (e.g., fork server down)
- **WHEN** the iframe fails to load within a bounded timeout
- **THEN** the page shows an explicit error state naming the workbench service as unavailable

---

### Requirement: WE-02 Seam Protocol & Token Handshake

**Priority**: P0

The system SHALL authenticate the embed seam with a one-time, owner-scoped token and
validate `event.origin` on both sides for every postMessage exchange. The postMessage
channel SHALL NOT confer any write authority: all persistence goes through A2 API
routes under the user's session.

**API**: `POST /api/workbench/token`
```
Request:  { projectId: string }
Response: { token: string, expiresAt }   // owner-only, one-time, TTL ≤ 5 minutes
```

#### Scenario: Handshake round trip

- **GIVEN** the workbench iframe has loaded
- **WHEN** A2 sends `handshake` with the token and project context
- **THEN** the bolt fork validates the origin and replies `handshake-ack` echoing the token
- **AND** messages with a mismatched origin or unknown source marker are ignored on both sides

#### Scenario: Token misuse

- **GIVEN** a token that is expired, already consumed, or issued for another project
- **WHEN** it is presented in any seam or API call
- **THEN** the system rejects the call (401/403) and does not persist anything

---

### Requirement: WE-03 Initial Prompt Handoff

**Priority**: P0

The system SHALL pass the creating prompt into the workbench so generation starts
without the user re-typing it.

#### Scenario: New project boots generation

- **GIVEN** a project created from a home-page prompt (`isNew = true`)
- **WHEN** the handshake delivers `{ prompt, isNew: true }`
- **THEN** the bolt workbench submits the prompt to its chat automatically
- **AND** generation proceeds inside WebContainer with live preview

---

### Requirement: WE-04 Artifact Export & Persistence

**Priority**: P0

The system SHALL persist the workbench build output as a file tree on explicit user
save, keeping the flattened entry document in `Project.code`.

**API**: `POST /api/workbench/artifact`
```
Request:  { projectId: string, files: object }   // dist file tree
Response: { ok, savedAt }
```

#### Scenario: Save from the workbench

- **GIVEN** a workbench session whose latest build produced a `dist` tree
- **WHEN** the user triggers the save action
- **THEN** bolt exports the dist file tree and posts `artifact` to A2
- **AND** A2 stores the tree in `Project.files`, sets `Project.code` to the `index.html` entry, sets status to `completed`, and bumps `updatedAt`
- **AND** the project's persisted preview (detail page / gallery) reflects the new artifact

#### Scenario: Save rejected for non-owner

- **GIVEN** a request to `POST /api/workbench/artifact` from a session that does not own the project
- **WHEN** the request is received
- **THEN** the system rejects it and the stored artifact is unchanged
