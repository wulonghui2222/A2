# User Auth

## MODIFIED Requirements

### Requirement: UA-01 User Registration

**Priority**: P0

The system SHALL allow new users to create an account with a username and password.
Registration is served by the fork application's server routes.

#### Scenario: Successful registration

- **WHEN** a visitor submits a unique username (4-20 chars) and password (≥6 chars) on `/register`
- **THEN** the system creates a User record with a bcrypt-hashed password
- **AND** the user is automatically logged in and redirected to the workbench home

#### Scenario: Duplicate username

- **WHEN** a visitor submits a username that already exists
- **THEN** the system displays an error: "用户名已被注册"

#### Scenario: Invalid input

- **WHEN** the username or password does not meet length requirements
- **THEN** the system displays a validation error with specific guidance

---

### Requirement: UA-02 User Login

**Priority**: P0

The system SHALL allow registered users to log in with their credentials.

#### Scenario: Successful login

- **WHEN** a user submits a valid username and password on `/login`
- **THEN** the system creates a signed JWT session stored in an httpOnly cookie
- **AND** the user is redirected to the destination they originally requested (or home)

#### Scenario: Invalid credentials

- **WHEN** the username does not exist or the password is incorrect
- **THEN** the system displays an error: "用户名或密码错误"

---

### Requirement: UA-03 Session Management

**Priority**: P0

The system SHALL maintain user sessions and expose authentication state to both
server-side route handlers and client components.

#### Scenario: Authenticated user state

- **WHEN** a logged-in user loads any page
- **THEN** the header/navigation displays their username and a "退出" action
- **AND** server-side route handlers can resolve the current user id from the session

#### Scenario: Logout

- **WHEN** the user clicks "退出"
- **THEN** the session cookie is invalidated
- **AND** the user is redirected to the home page as an anonymous visitor

---

### Requirement: UA-04 Route Protection

**Priority**: P0

The system SHALL protect authenticated routes via route-level guards.

#### Scenario: Access protected route without login

- **WHEN** an anonymous user navigates to the workbench, `/my-projects`, or calls the LLM/chat APIs
- **THEN** the system redirects to `/login` with return to the original destination after login

#### Scenario: Access public route while logged in

- **WHEN** a logged-in user navigates to `/login` or `/register`
- **THEN** the system redirects to the home page

## REMOVED Requirements

### Requirement: UA-05 My Projects View

**Reason**: "My Projects" behavior moves into the new `workbench` capability
(WB-07 My Projects Management), where projects are chats persisted server-side
and rendered by the fork application with Chinese UI copy.

**Migration**: See `specs/workbench/spec.md` — Requirement WB-07 covers listing,
empty state, opening, and deletion of own projects.
