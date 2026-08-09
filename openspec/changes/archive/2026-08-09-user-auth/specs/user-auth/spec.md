## Purpose

Provides user account management including registration, login, session persistence,
and a personalized "My Projects" view so that generated applications are tied to their creators.

## ADDED Requirements

### Requirement: UA-01 User Registration

**Priority**: P0

The system SHALL allow new users to create an account with a username and password.

#### Scenario: Successful registration

- **WHEN** a visitor submits a unique username (4-20 chars) and password (≥6 chars) on `/register`
- **THEN** the system creates a User record with a bcrypt-hashed password
- **AND** the user is automatically logged in and redirected to the home page

#### Scenario: Duplicate username

- **WHEN** a visitor submits a username that already exists
- **THEN** the system displays an error: "用户名已被注册"

#### Scenario: Invalid input

- **WHEN** the username or password does not meet length requirements
- **THEN** the system displays a validation error with specific guidance

### Requirement: UA-02 User Login

**Priority**: P0

The system SHALL allow registered users to log in with their credentials.

#### Scenario: Successful login

- **WHEN** a user submits a valid username and password on `/login`
- **THEN** the system creates a JWT session stored in an httpOnly cookie
- **AND** the user is redirected to the home page

#### Scenario: Invalid credentials

- **WHEN** the username does not exist or the password is incorrect
- **THEN** the system displays an error: "用户名或密码错误"

### Requirement: UA-03 Session Management

**Priority**: P0

The system SHALL maintain user sessions and expose authentication state to both
server and client components.

#### Scenario: Authenticated user state

- **WHEN** a logged-in user loads any page
- **THEN** the Header displays their username and a "退出" button
- **AND** server components can access `session.user.id`

#### Scenario: Logout

- **WHEN** the user clicks "退出"
- **THEN** the session cookie is invalidated
- **AND** the user is redirected to the home page as an anonymous visitor

### Requirement: UA-04 Route Protection

**Priority**: P0

The system SHALL protect authenticated routes via middleware.

#### Scenario: Access protected route without login

- **WHEN** an anonymous user navigates to `/my-projects` or submits `POST /api/generate`
- **THEN** the system redirects to `/login?callbackUrl=<original-url>`

#### Scenario: Access public route while logged in

- **WHEN** a logged-in user navigates to `/login` or `/register`
- **THEN** the system redirects to the home page

### Requirement: UA-05 My Projects View

**Priority**: P1

The system SHALL provide a "My Projects" page that displays all applications
created by the currently logged-in user.

#### Scenario: View own projects

- **WHEN** a logged-in user navigates to `/my-projects`
- **THEN** the system displays a card grid of their projects
- **AND** each card shows thumbnail (or placeholder), title, and creation time
- **AND** cards are sorted by `updatedAt` descending

#### Scenario: Empty state

- **WHEN** a logged-in user has no projects
- **THEN** the page displays a prompt: "还没有应用，去创建一个吧" with a link to the home page

#### Scenario: Click project card

- **WHEN** the user clicks a project card
- **THEN** the system navigates to `/projects/:id`
