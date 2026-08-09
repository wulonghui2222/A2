## Purpose

A public showcase page where any visitor can browse, filter, and explore projects created by the community, sorted by popularity.

## ADDED Requirements

### Requirement: Gallery Page

**Priority**: P2

The system SHALL provide a gallery page (`/gallery`) accessible without authentication, displaying all public projects as browsable cards.

#### Scenario: Browse the gallery

- **GIVEN** any visitor (authenticated or not) navigates to `/gallery`
- **WHEN** the page loads
- **THEN** all projects with `isPublic === true` and `status === "completed"` are displayed as cards
- **AND** cards are sorted by `viewCount` descending (most popular first)
- **AND** each card shows title, thumbnail (or placeholder), tags, and view count

#### Scenario: Tag filter

- **GIVEN** the gallery page has loaded
- **WHEN** the visitor clicks a tag chip
- **THEN** the project list filters to show only projects containing that tag
- **AND** the selected tag chip is visually highlighted
- **AND** clicking the same chip again removes the filter
- **AND** multiple tags can be selected (AND logic)

#### Scenario: Tag aggregation

- **GIVEN** the gallery page loads
- **WHEN** the system computes available tags
- **THEN** tag chips are derived from the union of all public projects' `tags` fields
- **AND** each chip shows the tag name and the count of matching projects

#### Scenario: Gallery card interaction

- **GIVEN** the visitor sees gallery cards
- **WHEN** the visitor clicks a card
- **THEN** the system navigates to `/projects/:id` (read-only detail view for non-owners)
- **AND** gallery cards do NOT show delete, rename, or toggle actions

#### Scenario: Empty gallery

- **GIVEN** no public projects exist (or none match the selected tags)
- **WHEN** the gallery page loads
- **THEN** the system displays a friendly empty state message
