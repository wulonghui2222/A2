# project-plaza Delta Spec

## MODIFIED Requirements

### Requirement: PL-01 Plaza Listing

**Priority**: P1

The system SHALL provide a plaza page (route `/plaza`) accessible without
authentication, listing all public projects as cards sorted by `viewCount`
descending. Each card SHALL show the project title, description, view count,
and a thumbnail. The thumbnail SHALL be the project's captured runtime
screenshot when one exists, falling back to a placeholder image otherwise.
UI copy SHALL be Chinese, using "项目" for the generated artifact.

#### Scenario: Visitor browses the plaza

- **GIVEN** one or more public projects exist
- **WHEN** an anonymous visitor opens `/plaza`
- **THEN** the page lists public projects sorted by `viewCount` descending
- **AND** each card shows title, description, view count, and a thumbnail
- **AND** cards whose project has a captured screenshot show that screenshot
- **AND** cards without a screenshot show the placeholder image

#### Scenario: Empty plaza

- **GIVEN** no public projects exist
- **WHEN** a visitor opens `/plaza`
- **THEN** the page shows a Chinese empty-state message

## ADDED Requirements

### Requirement: PL-04 Thumbnail Capture on Publish

**Priority**: P2

The system SHALL capture a runtime screenshot of a project automatically when
its owner publishes it to the plaza (and again whenever a project with an
updated file snapshot is re-published), and store it as the project's
thumbnail. The publish entry SHALL live in the workbench header and SHALL
force-save the project's file snapshot before publishing. Capture SHALL run
in the owner's browser as a current-tab capture of the running workbench
preview (one user confirmation on the browser's share dialog), cropping the
visible preview region, and SHALL NOT block or fail the publish operation:
publishing takes effect immediately, and any capture failure or user
cancellation leaves the project public with the placeholder thumbnail.
Transient UI overlays (toasts) SHALL be excluded from the captured image.
Thumbnail uploads SHALL be owner-only and size-limited.

#### Scenario: Publish triggers thumbnail capture

- **GIVEN** an owner publishing a project from the workbench header
- **WHEN** the publish button is activated
- **THEN** the project's file snapshot is force-saved automatically
- **AND** the project becomes public immediately
- **AND** the system captures the running preview via a current-tab screenshot (owner confirms once in the browser's share dialog), excluding toast overlays, crops the visible preview region, and uploads it as the project's thumbnail
- **AND** the plaza card shows the screenshot once the upload completes

#### Scenario: Publish without a prior manual save

- **GIVEN** an owner who never clicked the explicit save button
- **WHEN** they activate the publish button
- **THEN** the snapshot is saved automatically as part of publishing
- **AND** publishing proceeds without a "save first" error

#### Scenario: Capture failure degrades gracefully

- **GIVEN** a publish whose thumbnail capture fails or times out
- **WHEN** capture does not produce an upload
- **THEN** the project remains public and fully browsable
- **AND** its plaza card shows the placeholder image
- **AND** no error is shown to visitors

#### Scenario: Re-publish refreshes the thumbnail

- **GIVEN** a public project whose owner edited the project and re-publishes it
- **WHEN** the publish button is activated again
- **THEN** a new snapshot is force-saved and a new screenshot is captured from the running preview
- **AND** the stored thumbnail is replaced with the new capture

#### Scenario: Thumbnail upload is owner-only

- **WHEN** a non-owner (or anonymous visitor) attempts to upload a thumbnail for a project
- **THEN** the system rejects the request
- **AND** oversized payloads above the configured limit are rejected
