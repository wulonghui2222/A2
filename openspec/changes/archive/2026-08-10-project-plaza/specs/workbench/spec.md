# workbench Delta Spec

## MODIFIED Requirements

### Requirement: WB-06 Server-Side Chat Persistence

**Priority**: P0

The system SHALL persist chats and their messages on the server, associated
with the creating user. Chats SHALL survive page refresh, browser restart, and
browser switch (after login). Browser-local storage SHALL NOT be the system of
record. When a chat is saved, the system SHALL additionally persist a snapshot
of the project's current file tree so that the plaza can reconstruct the
project files without parsing message history.

#### Scenario: Chat survives refresh

- **GIVEN** a user mid-conversation in a chat
- **WHEN** the page is reloaded
- **THEN** the chat list and the full message history are restored from the server

#### Scenario: Chat list scoped to owner

- **WHEN** the chat list loads
- **THEN** only chats created by the logged-in user are shown

#### Scenario: New chat creation is persisted

- **WHEN** the user starts a new chat and submits the first message
- **THEN** a project record is created server-side under the user's account
- **AND** the project title is derived from the chat description

#### Scenario: File snapshot persisted on save

- **WHEN** a chat is saved server-side
- **THEN** the current workspace file tree is serialized and stored with the project
- **AND** the snapshot reflects the latest workspace files at save time

## ADDED Requirements

### Requirement: WB-10 Public Visibility Toggle

**Priority**: P1

The system SHALL allow the owner of a project to publish it to the plaza or
withdraw it, via an owner-only toggle. Publishing SHALL require a file
snapshot to exist; if none exists, the system SHALL reject the publish with a
Chinese guidance message. Withdrawal SHALL immediately remove the project
from the plaza and block visitor access.

#### Scenario: Owner publishes a project

- **GIVEN** an owner with a project that has a file snapshot
- **WHEN** the owner activates the publish toggle
- **THEN** the project becomes public and appears in the plaza

#### Scenario: Publish blocked without snapshot

- **GIVEN** an owner with a project that has no file snapshot
- **WHEN** the owner attempts to publish
- **THEN** the system rejects the publish with a Chinese guidance message
- **AND** the project remains private

#### Scenario: Owner withdraws a project

- **GIVEN** a public project
- **WHEN** the owner deactivates the publish toggle
- **THEN** the project is removed from the plaza immediately
- **AND** visitor requests to its public detail view return 404

#### Scenario: Non-owner cannot toggle

- **WHEN** a non-owner (or anonymous visitor) attempts to change a project's visibility
- **THEN** the system rejects the request
