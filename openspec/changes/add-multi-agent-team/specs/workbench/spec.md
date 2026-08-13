# Workbench 生成工作台 — 多智能体团队模式增量

## MODIFIED Requirements

### Requirement: WB-01 Chat-Based Generation

**Priority**: P0

The system SHALL allow authenticated users to generate a multi-file project by entering
a natural language description in the workbench chat. Generation SHALL stream
incrementally: assistant text, file actions, and shell actions appear in the chat as
they are produced, and files are written into the project workspace while streaming.
For a first generation (a new chat with no prior messages), when the agent mode is set
to multi-agent, the system SHALL precede generation with a PD planning round and a
mandatory review gate as defined by the `multi-agent` capability, and execution after
approval SHALL be driven step by step by the TL orchestrator as defined by the
`tl-orchestrator` capability; while the planning round is active, no workspace file
SHALL be written before the gate is passed. In single-agent mode the system SHALL
follow the direct path without planning or orchestration for every message. In
multi-agent mode, follow-up (iteration) messages SHALL first pass the triage defined
by the `multi-agent` capability: trivial changes follow the direct path, while major
changes enter the same planning round, mandatory gate, and TL step-by-step execution
as first generation.

#### Scenario: Generate a project from a prompt

- **GIVEN** an authenticated user on a new chat in the workbench
- **WHEN** the user submits a natural language description
- **THEN** the assistant response streams into the chat in real time
- **AND** generated files appear in the workspace file tree as they are produced
- **AND** upon completion the preview runs the generated project

#### Scenario: Generation failure

- **GIVEN** the model returns an error or the stream aborts
- **WHEN** generation fails mid-stream
- **THEN** the chat displays an error message with a retry path
- **AND** already-written files remain available in the workspace

#### Scenario: Unauthenticated access

- **GIVEN** an anonymous visitor
- **WHEN** the visitor attempts to open the workbench
- **THEN** the system redirects to the login page with return to the original destination after login

#### Scenario: Planning round precedes first generation

- **GIVEN** the agent mode is set to 多智能体 for a first generation
- **WHEN** the user submits the prompt
- **THEN** the PD planning round runs and the review gate is presented before any file is written
- **AND** after approval the TL orchestrator drives execution one plan step per generation round

#### Scenario: Trivial iteration goes direct

- **GIVEN** a chat that already has messages in multi-agent mode
- **WHEN** the user sends a follow-up message triaged as trivial
- **THEN** no planning round and no orchestration runs

#### Scenario: Major iteration enters the team flow

- **GIVEN** a chat that already has messages in multi-agent mode
- **WHEN** the user sends a follow-up message triaged as major
- **THEN** an incremental planning round and the review gate run before any file is written
- **AND** after approval the TL orchestrator drives execution one plan step per generation round

## ADDED Requirements

### Requirement: WB-17 Planning Phase Observability

**Priority**: P1

The system SHALL extend the staged request status feedback with a planning phase: while
a planning round streams, the chat SHALL display a Chinese "PD 正在规划" indicator with
a live elapsed-time counter, and plan steps SHALL render incrementally as they arrive.
Timing statistics SHALL distinguish planning rounds from execution rounds so that
first-token metrics of each phase are not mixed. Planning-phase statistics SHALL follow
the same persistence rules as other response statistics.

#### Scenario: Planning phase indicator

- **WHEN** a planning round streams after the user submits a prompt that enters planning
  (a first generation or a major iteration change)
- **THEN** the chat shows a "PD 正在规划" status with a live elapsed-time counter
- **AND** plan steps appear incrementally as they stream

#### Scenario: Phase-separated timing

- **WHEN** a first generation completes with a planning round followed by execution rounds
- **THEN** the timing statistics report the planning and execution phases separately
- **AND** each phase's first-token timing is measured from its own round start

---

### Requirement: WB-18 TL Execution Progress Observability

**Priority**: P1

While TL orchestration drives execution rounds, the request status feedback and timing
statistics SHALL attribute each execution round to its plan step so per-step timing is
observable. Execution-round statistics SHALL carry the step index and follow the same
persistence rules as other response statistics. The statistics display SHALL keep
planning, per-step execution, and legacy single-agent rounds distinguishable.

#### Scenario: Step-attributed round statistics

- **WHEN** an orchestrated execution round for step i completes
- **THEN** its timing statistics are recorded with phase execution and step index i
- **AND** they persist with the round's assistant message

#### Scenario: Panel and statistics stay consistent

- **WHEN** orchestration advances from step i to step i+1
- **THEN** the progress panel and the per-round statistics both reflect the step transition
