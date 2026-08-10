# App Core — Atoms Demo

## Purpose

A2 Atoms Demo 是一个 AI 驱动的 Web 项目生成平台。用户通过自然语言描述需求，
工作台（`workbench` 能力）完成多文件工程的生成、预览与迭代；模型访问由平台
统一 LLM 网关（`llm-gateway` 能力）提供。本能力定义平台级的生成入口与非功能
约束；多 Agent 流水线、单 HTML 沙箱预览、模板与画廊等旧需求已在
bolt-fork-replatform 重构中退役（FR-02 ~ FR-08）。

## Requirements

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

### Requirement: NFR-01 Performance

**Priority**: P1

The system SHALL meet the following performance targets:

| Metric | Target |
|--------|--------|
| First contentful paint (LCP) | < 3s |
| AI generation response time | < 60s (single generation) |
| Preview render time | < 2s |
| API response time (non-generation) | < 500ms |
| Concurrent users | ≥ 10 |

#### Scenario: Generation streams within budget

- **WHEN** the user submits a generation prompt
- **THEN** the first streamed content arrives within the generation response-time budget
- **AND** non-generation API calls respond within 500ms

---

### Requirement: NFR-02 Usability

**Priority**: P1

The system SHALL provide responsive feedback and recovery paths:

- All interactive elements SHALL provide visual feedback within 200ms
- Generation process SHALL display clear loading state and progress indicators
- Error scenarios SHALL present friendly error messages with recovery paths
- Application SHALL be basically usable on mobile (responsive layout)

#### Scenario: Friendly failure recovery

- **WHEN** an operation fails (generation, persistence, authentication)
- **THEN** the user sees a clear error message with a retry or corrective path

---

### Requirement: NFR-03 Security

**Priority**: P1

The system SHALL isolate generated content and protect credentials:

- User input SHALL be sanitized before rendering to prevent XSS
- Generated projects SHALL run inside the WebContainer sandbox to isolate risk
- API routes SHALL enforce authentication; platform credentials SHALL only be used server-side, never stored in DB or delivered to the browser

#### Scenario: No credential leakage

- **WHEN** a user inspects any client-side asset, request, or response
- **THEN** no platform credential or server-side secret is exposed

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

---

### Requirement: NFR-05 Extensibility

**Priority**: P2

The architecture SHALL keep extension points open:

- LLM service layer SHALL be abstracted to support model switching
- Platform customization SHALL be isolated from upstream fork code to keep merges manageable
- Data layer SHALL support migration from SQLite to PostgreSQL

#### Scenario: Default model is configurable

- **WHEN** the platform default model is changed via environment configuration
- **THEN** generation uses the newly configured model without code changes
