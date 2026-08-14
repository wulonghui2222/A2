# Multi-Agent 多智能体团队模式（模式开关 + PD 规划 + 审查闸门 + 迭代分诊）

## Purpose

为项目生成全生命周期提供多智能体团队流水线：模式开关选择团队模式后，首次生成与
迭代大改动均由 PD 产出产品语言的需求清单（迭代为注入项目上下文的增量计划），经
用户必审闸门批准后交由 TL 编排器逐步驱动执行，并提供全程降级与逃生路径。

## Requirements

### Requirement: MA-01 Planning Endpoint Contract

**Priority**: P0

The system SHALL expose a server-side planning endpoint (the PD agent) that requires an
authenticated session, uses the platform default model with server-side key injection,
and streams its response back to the client. A first-generation planning call SHALL
produce two structured sections in order: a starter-template selection (template name
and project title) and a requirements plan of 4 to 6 steps written in product language
— what will be built (features, interactions, persistence, preview), never file names,
framework names, or other implementation details. An incremental planning call (for an
iteration change) SHALL receive project context — the current workspace file tree, the
latest approved plan with per-step completion state, and the user's new request — and
SHALL produce a requirements plan of steps phrased as changes on top of the existing
project, without any template selection section. The planning call SHALL NOT write any
project files, run any commands, or otherwise mutate the workspace. The planning
response SHALL NOT surface model reasoning content to the planning UI.

#### Scenario: Planning call produces both sections

- **WHEN** an authenticated user triggers planning for a first-generation prompt
- **THEN** the planning response contains a template selection and a step plan
- **AND** no workspace file or shell action is executed during the planning round

#### Scenario: Incremental planning uses project context

- **WHEN** planning is triggered for an iteration change classified as major
- **THEN** the planning call receives the workspace file tree, the latest approved plan
  with completion state, and the new request
- **AND** the response contains a step plan phrased as changes on top of the existing
  project, with no template selection section

#### Scenario: Unauthenticated planning request

- **WHEN** a planning request arrives without a valid session
- **THEN** the endpoint responds 401 and performs no upstream model call

#### Scenario: Reasoning hidden in planning UI

- **GIVEN** the planning model produces reasoning content before its answer
- **WHEN** the planning response streams to the client
- **THEN** the planning UI renders only the plan steps, not the reasoning content

#### Scenario: Plan steps stay in product language

- **WHEN** the planning call finishes
- **THEN** every plan step describes a user-visible capability or behavior
- **AND** no step names files, paths, or technical implementation choices

---

### Requirement: MA-02 Agent Mode Switch

**Priority**: P1

The system SHALL provide a two-state agent mode switch (单智能体 / 多智能体) in the
prompt input area, rendered for the entire conversation lifecycle — before the first
generation and throughout iteration. The default SHALL be 单智能体, which follows the
existing direct-generation path with zero behavioral change. While a TL orchestration
is active, the switch SHALL be visible but disabled with an explanatory tooltip. The
user's choice SHALL persist across sessions via browser cookie. The entire switch and
multi-agent feature SHALL be gated by a feature flag; when the flag is disabled the
switch SHALL NOT render and behavior SHALL be exactly as before.

#### Scenario: Switch stays visible after chat starts

- **WHEN** a conversation has started (chat has messages)
- **THEN** the agent mode switch remains rendered and can be toggled between rounds

#### Scenario: Switch disabled during orchestration

- **GIVEN** a TL orchestration is actively driving step rounds
- **WHEN** the user tries to toggle the switch
- **THEN** the switch is disabled and a tooltip explains that orchestration must be
  terminated first

#### Scenario: Choice persists across sessions

- **WHEN** the user selects 多智能体 and later reloads the page
- **THEN** the switch shows 多智能体

#### Scenario: Flag disabled hides feature

- **WHEN** the multi-agent feature flag is disabled
- **THEN** no switch renders and all messages follow the single-agent path

#### Scenario: Single agent keeps the legacy path

- **GIVEN** the switch is set to 单智能体
- **WHEN** the user submits any message (first generation or iteration)
- **THEN** the message follows the pre-feature direct path with no planning and no triage

---

### Requirement: MA-03 Mandatory Review Gate

**Priority**: P0

In multi-agent mode, after a plan is produced the system SHALL always apply a hard gate
requiring explicit user approval before execution. The system SHALL NOT auto-continue,
auto-approve, time out into execution, or otherwise bypass the gate based on any model
classification. The only way to leave the gate without approval SHALL be the user
explicitly choosing to skip.

#### Scenario: Plan always waits for approval

- **GIVEN** the agent mode is 多智能体
- **WHEN** a plan finishes streaming, regardless of how trivial the request looks
- **THEN** execution does not start until the user explicitly approves or skips

#### Scenario: No automatic pass

- **GIVEN** the plan card has been displayed
- **WHEN** the user takes no action
- **THEN** the system waits indefinitely and never starts execution on its own

---

### Requirement: MA-04 Plan Review, Edit and Approval

**Priority**: P0

The system SHALL render the streamed plan as a review card with approve, edit, replan,
and skip actions. Editing SHALL let the user modify the plan text locally without any
model call, and the edited plan SHALL be the one driving execution. Replan SHALL issue
another planning call carrying the user's feedback. On approval, the plan SHALL be
persisted as an assistant message with a plan annotation carrying the PD role marker
through the existing message persistence channel, and the approved steps SHALL be
handed to the TL orchestrator for step-by-step execution. After approval, the selected
starter template's files SHALL be fetched before the first execution round.

#### Scenario: Plan survives reload

- **WHEN** a project with an approved plan is reopened
- **THEN** the plan message with its annotation (including the PD role marker) is restored

#### Scenario: Edited plan drives execution

- **WHEN** the user edits a step in the plan card and approves
- **THEN** the execution rounds receive the edited plan text, not the original

#### Scenario: Replan carries feedback

- **WHEN** the user rejects the plan with feedback and requests replanning
- **THEN** a new planning call is made including the feedback and a fresh plan streams back

#### Scenario: Approval hands over to TL orchestration

- **WHEN** the user approves the plan
- **THEN** the system fetches the selected starter template files and hands the approved
  steps to the TL orchestrator, which starts the first step's execution round

#### Scenario: Plan card is collapsible

- **WHEN** the user collapses the plan review card
- **THEN** the step list is hidden while the header (with a step-count summary) and the
  action buttons remain visible
- **AND** expanding restores the full step list; editing the plan auto-expands the card

---

### Requirement: MA-05 Degradation and Escape Paths

**Priority**: P1

The system SHALL allow the user to abort the planning round mid-stream and continue
with direct generation without a plan; skip SHALL only ever be triggered by the user.
When a planning call fails, times out, or its output cannot be parsed, the system
SHALL degrade to the single-agent direct path without blocking the user, informing
them via a transient notice. When only the template selection section fails to parse,
the system SHALL fall back to the blank template while keeping the plan. When the
iteration triage call fails or times out, the system SHALL degrade to the direct path
without blocking the user.

#### Scenario: Skip planning mid-stream

- **WHEN** the user chooses to skip while the plan is still streaming
- **THEN** the planning round is aborted and generation proceeds directly without a plan

#### Scenario: Planning failure degrades gracefully

- **WHEN** the planning call errors or returns unparseable output
- **THEN** the system falls back to the single-agent direct generation path and shows a transient Chinese notice

#### Scenario: Template parse failure falls back to blank

- **GIVEN** a valid plan but an unparseable template selection
- **WHEN** the user approves the plan
- **THEN** generation proceeds with the blank template

#### Scenario: Triage failure degrades to direct path

- **WHEN** the iteration triage call errors or times out
- **THEN** the iteration message follows the direct path without blocking the user

---

### Requirement: MA-06 Iteration Message Triage

**Priority**: P0

In multi-agent mode, every iteration message (a follow-up message in a chat that
already has messages) SHALL first pass a lightweight triage classification that routes
the message either to the direct path (trivial change) or to the incremental planning
flow (major change). Triage SHALL be a single non-streaming model call completing
within a few seconds, and SHALL only decide routing — it SHALL NOT bypass or weaken
the mandatory review gate, which applies unchanged once a plan is produced. The triage
outcome SHALL be briefly visible to the user and SHALL be overridable: the user may
force a major-classified message onto the direct path, or force a trivial-classified
message into the planning flow. In single-agent mode no triage SHALL run.

#### Scenario: Trivial change goes direct

- **GIVEN** the agent mode is 多智能体 and the chat has messages
- **WHEN** the user sends an iteration message classified as trivial
- **THEN** the message follows the direct single-agent path with no planning round

#### Scenario: Major change enters planning flow

- **WHEN** the user sends an iteration message classified as major
- **THEN** an incremental planning round runs, followed by the same mandatory gate and
  TL step-by-step execution as first generation

#### Scenario: User overrides triage outcome

- **WHEN** triage classifies a message and shows its outcome
- **THEN** the user can override it — forcing direct execution for a major result or
  requesting planning for a trivial result — before execution proceeds

#### Scenario: No triage in single-agent mode

- **GIVEN** the switch is set to 单智能体
- **WHEN** the user sends an iteration message
- **THEN** no triage call is made and the message goes directly to the legacy path
