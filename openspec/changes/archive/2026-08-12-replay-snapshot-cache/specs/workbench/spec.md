# Workbench Delta: replay-snapshot-cache

## ADDED Requirements

### Requirement: WB-15 Replay Snapshot Restore

**Priority**: P0

The system SHALL cache a snapshot of the WebContainer workspace after a generation round completes a dependency install successfully, and SHALL restore that snapshot when the same project is re-opened (replay) instead of re-executing file writes and the install command. A snapshot SHALL be associated with the content of the project's `package.json` at install time; a replay SHALL use the cached snapshot only when the association matches the current project's `package.json`. A restore SHALL repair executable permissions on restored `node_modules/.bin` entries before any start action runs. When no matching snapshot exists, when the snapshot cannot be restored, or when the restored workspace fails to start the dev server, the system SHALL fall back to the full replay path (file re-execution plus install) without user-visible failure. A snapshot-restored replay SHALL produce the same workspace state and preview outcome as a full replay.

#### Scenario: Cache hit skips install on project re-open

- **WHEN** a user re-opens a previously generated project whose `package.json` matches a cached snapshot
- **THEN** the replay restores the workspace from the snapshot, skips the install command entirely, starts the dev server, and the preview becomes available

#### Scenario: Dependency change invalidates the cache

- **WHEN** a replay's `package.json` content differs from the snapshot's recorded association
- **THEN** the replay ignores the snapshot and runs the full replay path including install

#### Scenario: Restore failure falls back silently

- **WHEN** the snapshot restore throws, or the dev server fails to start after restore
- **THEN** the system re-runs the full replay path (file re-execution plus install) and the user sees the same end state as an uncached replay, with no error surfaced

#### Scenario: Post-snapshot edits are preserved

- **WHEN** a project has rounds after the cached snapshot was taken that modify files
- **THEN** the replay applies those later file changes on top of the restored snapshot, so the final workspace matches a full round-by-round replay

#### Scenario: Restore is observable in telemetry

- **WHEN** a replay round restores from a snapshot
- **THEN** the round's telemetry records the restore outcome (hit or miss, restore duration) and remains compatible with rounds that have no install action

### Requirement: WB-16 Snapshot Cache Write-Back and Governance

**Priority**: P1

The system SHALL write snapshots back asynchronously after the preview of the installing round has opened, so write-back never delays the user-perceived generation path. Snapshot storage SHALL live entirely in the browser (no server upload, no network request) and SHALL be bounded by total size with least-recently-used eviction. Losing the cache (browser data cleared, new device) SHALL only result in a cold install, never in an error.

#### Scenario: Write-back does not delay the user

- **WHEN** an install completes and the preview opens
- **THEN** the snapshot write-back runs afterwards in the background and does not extend the time to preview

#### Scenario: Cache size is bounded

- **WHEN** the total stored snapshot size exceeds the configured limit
- **THEN** the least recently used snapshots are evicted until the total is within the limit

#### Scenario: Cleared cache degrades gracefully

- **WHEN** the user clears browser site data and re-opens a project
- **THEN** the replay runs the full path with a fresh install and succeeds, and a new snapshot is written back after the preview opens
