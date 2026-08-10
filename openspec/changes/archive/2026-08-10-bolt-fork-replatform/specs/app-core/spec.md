# App Core

## MODIFIED Requirements

### Requirement: FR-01 Application Generation

**Priority**: P0

The system SHALL allow **authenticated** users to generate a runnable multi-file
project by describing requirements in natural language, through the workbench chat
flow. Generation, preview, and iteration are provided by the `workbench` capability;
model access is provided by the `llm-gateway` capability. Unauthenticated users SHALL
be prompted to log in before generation. The legacy multi-agent pipeline (PM →
Architect → Engineer) and its polling status APIs no longer exist.

#### Scenario: User generates a project from a prompt

- **GIVEN** an authenticated user on the workbench
- **WHEN** the user enters a natural language description and submits it
- **THEN** the assistant streams its response while writing project files
- **AND** a live, interactive preview of the generated project runs upon completion

#### Scenario: Unauthenticated user attempts generation

- **GIVEN** an anonymous user
- **WHEN** the user attempts to access the workbench or generation APIs
- **THEN** the system redirects to the login page with return to the original destination

---

### Requirement: NFR-04 Deployability

**Priority**: P0

The application SHALL run as a local development deployment (single Node process,
file-based SQLite database). Production/cloud deployment (including one-click Vercel
deploy) is out of scope for this phase. Environment variables SHALL manage the
platform LLM credential and sensitive config.

#### Scenario: Local run

- **WHEN** a developer starts the application locally
- **THEN** the full product (workbench, auth, persistence, LLM gateway) is usable on localhost
- **AND** no external hosting service is required

## REMOVED Requirements

### Requirement: FR-02 Multi-Agent Collaboration

**Reason**: Product decision (2026-08-10): the multi-agent narrative is abandoned.
Generation uses the single-assistant workbench chat flow instead.

**Migration**: None — capability permanently retired; no replacement requirement.

---

### Requirement: FR-03 Application Preview

**Reason**: Preview is provided by the workbench's WebContainer live preview,
which supersedes the single-HTML sandboxed-iframe model.

**Migration**: See `specs/workbench/spec.md` — Requirement WB-02 Live Preview.

---

### Requirement: FR-04 Data Persistence

**Reason**: Persistence model changes from Project/Session/AgentMessage to
server-side chat persistence owned by the workbench capability.

**Migration**: See `specs/workbench/spec.md` — Requirement WB-06 Server-Side Chat
Persistence. Existing SQLite database is discarded; no data migration.

---

### Requirement: FR-05 Project Management

**Reason**: Project management moves to the workbench capability with the new
chat-based project model.

**Migration**: See `specs/workbench/spec.md` — Requirements WB-07 My Projects
Management and WB-08 Access Protection.

---

### Requirement: FR-06 Template System

**Reason**: Deferred — out of scope for the first phase of the replatform.

**Migration**: Reopen as a new change when templates are needed; bolt.diy's native
template mechanism is the expected starting point.

---

### Requirement: FR-07 Project Gallery

**Reason**: Public sharing requires server-side project file snapshots, which are
deferred; the public toggle and gallery are out of scope for this phase.

**Migration**: Reopen as a new change when public sharing is needed (snapshot
design is an open problem recorded in the change's exploration history).

---

### Requirement: FR-08 Iterative Editing

**Reason**: Conversational iteration is native to the workbench chat flow;
the dedicated iterate API is no longer needed.

**Migration**: See `specs/workbench/spec.md` — Requirement WB-05 Iterative Editing.
