# project-plaza Delta Spec

## Purpose

提供项目广场社区浏览能力：访客无需登录即可浏览公开项目列表，打开公开项目体验
实时运行效果并阅读代码（只读视图），浏览量作为广场热度排序依据。

## ADDED Requirements

### Requirement: PL-01 Plaza Listing

**Priority**: P1

The system SHALL provide a plaza page (route `/plaza`) accessible without
authentication, listing all public projects as cards sorted by `viewCount`
descending. Each card SHALL show the project title, description, view count,
and a placeholder thumbnail. UI copy SHALL be Chinese, using "项目" for the
generated artifact.

#### Scenario: Visitor browses the plaza

- **GIVEN** one or more public projects exist
- **WHEN** an anonymous visitor opens `/plaza`
- **THEN** the page lists public projects sorted by `viewCount` descending
- **AND** each card shows title, description, view count, and placeholder thumbnail

#### Scenario: Empty plaza

- **GIVEN** no public projects exist
- **WHEN** a visitor opens `/plaza`
- **THEN** the page shows a Chinese empty-state message

---

### Requirement: PL-02 Read-Only Public Project Experience

**Priority**: P1

The system SHALL allow any visitor (authenticated or anonymous) to open a
public project and experience it through a live preview booted from the
project's file snapshot, together with a read-only code editor (file tree
browsing and code reading). The visitor view SHALL NOT expose chat history,
terminal, diff/revert, or any editing capability.

#### Scenario: Visitor opens a public project

- **GIVEN** a public project with a file snapshot
- **WHEN** a visitor opens the project's public detail view
- **THEN** the system boots the preview from the stored file snapshot
- **AND** the visitor can browse the file tree and read code in a read-only editor
- **AND** no chat history, terminal, or editing controls are shown

#### Scenario: Non-public or missing project

- **WHEN** a visitor requests a project that is not public or does not exist
- **THEN** the system responds with 404 (no information leakage about existence)

#### Scenario: Public project without snapshot

- **GIVEN** a project marked public whose file snapshot is missing
- **WHEN** a visitor opens its public detail view
- **THEN** the system shows a friendly Chinese message instead of a broken preview

---

### Requirement: PL-03 View Count

**Priority**: P2

The system SHALL increment a public project's view count whenever any visitor
(including the owner) opens its public detail view. The view count SHALL
persist server-side and drive plaza sorting.

#### Scenario: View count increments on open

- **WHEN** any visitor opens a public project's detail view
- **THEN** the project's `viewCount` is incremented server-side
- **AND** the updated count is reflected in the plaza listing
