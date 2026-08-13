# TL Orchestrator TL 编排器（逐步骤推进计划执行）

## Purpose

在用户批准计划后由 TL 编排器接管执行：把计划拆成逐步骤的独立生成轮，全自动推进
直到全部完成，实时呈现进度，任一步骤失败立即暂停并交还用户处置。

## ADDED Requirements

### Requirement: TL-01 Step-by-Step Execution Orchestration

**Priority**: P0

After the user approves a plan, the TL orchestrator SHALL drive execution by issuing one
independent generation round per approved plan step, in plan order, advancing to the
next step automatically without any user action between rounds. Each round SHALL carry a
step instruction scoped to the current step together with the approved plan and the
completion state of earlier steps as context, so the existing generation stream executes
one step at a time against the accumulated workspace. The orchestrator SHALL be
deterministic client-side logic and SHALL NOT itself invoke any model. Orchestration
SHALL drive any approved plan — a first-generation plan or an approved incremental
plan from an iteration — with identical mechanics. Iteration messages routed to the
direct path (single-agent mode, trivial triage outcome, or user override) SHALL NOT
trigger orchestration.

#### Scenario: Rounds advance automatically

- **GIVEN** an approved plan of N steps
- **WHEN** step i's round completes successfully for i < N
- **THEN** the orchestrator starts step i+1's round without user interaction

#### Scenario: Step instruction is scoped

- **WHEN** a step round starts
- **THEN** its instruction names the current step, the approved plan, and which steps are already completed
- **AND** the round runs through the existing generation stream unchanged

#### Scenario: Direct-path iteration does not orchestrate

- **GIVEN** a chat where an orchestrated plan has finished
- **WHEN** the user sends a follow-up message routed to the direct path
- **THEN** the message follows the direct single-agent path with no orchestration

#### Scenario: Approved incremental plan is orchestrated

- **WHEN** the user approves an incremental plan produced for an iteration change
- **THEN** the orchestrator drives its steps with the same per-step round mechanics
  as a first-generation plan

---

### Requirement: TL-02 Step Completion Criteria

**Priority**: P0

A step round SHALL be considered complete only when its generation stream has ended and
every action emitted in the round has executed successfully. The orchestrator SHALL wait
for both signals before advancing; while actions from the round are still running, the
next step SHALL NOT start.

#### Scenario: Stream end alone does not complete a step

- **GIVEN** a step round whose stream has ended but whose shell actions are still running
- **WHEN** the orchestrator evaluates completion
- **THEN** the step stays in-progress until the actions settle

#### Scenario: Settled round completes the step

- **WHEN** a step round's stream has ended and all its actions finished successfully
- **THEN** the step is marked complete and the orchestrator proceeds

---

### Requirement: TL-03 Progress Visibility

**Priority**: P1

While orchestration is active, the system SHALL display a progress panel listing every
plan step with its current status (待执行 / 执行中 / 完成 / 失败) and a TL phase line
describing what the orchestrator is doing (e.g. dispatching planning, driving step i of
N, pausing on failure, wrapping up). The panel SHALL update as steps transition. UI copy
SHALL be in Chinese.

#### Scenario: Live step statuses

- **WHEN** orchestration is driving step 2 of 5
- **THEN** the panel shows step 1 as 完成, step 2 as 执行中, and steps 3-5 as 待执行
- **AND** the TL phase line shows the current step position

#### Scenario: Status transitions render immediately

- **WHEN** a step transitions between statuses
- **THEN** the panel reflects the new status without waiting for the next round boundary

---

### Requirement: TL-04 Failure Pause and User-Only Recovery

**Priority**: P0

When a step round fails — the generation stream errors or any action of the round
executes with an error — the orchestrator SHALL immediately pause and hand control to
the user. The paused state SHALL present exactly three user-only actions: retry the
failed step, skip it and continue with the next step, or terminate orchestration. The
system SHALL NOT retry automatically. Already-written files SHALL remain available in
the workspace in every outcome.

#### Scenario: Action error pauses orchestration

- **GIVEN** orchestration is driving step 3
- **WHEN** a shell action of step 3's round exits with an error
- **THEN** the orchestrator pauses, marks step 3 as 失败, and shows the three user actions
- **AND** no further round starts on its own

#### Scenario: Retry re-runs the failed step

- **WHEN** the user chooses retry on a paused step
- **THEN** the orchestrator starts a fresh round for the same step

#### Scenario: Skip advances past the failed step

- **WHEN** the user chooses skip on a paused step
- **THEN** the step stays marked as skipped and the orchestrator drives the next step

#### Scenario: Terminate ends orchestration

- **WHEN** the user chooses terminate
- **THEN** orchestration stops, the conversation returns to the normal iteration state,
  and already-written files remain available

---

### Requirement: TL-05 Completion Wrap-Up

**Priority**: P1

When the last step completes (or is skipped), the orchestrator SHALL emit a deterministic
wrap-up message summarizing the approved plan and the final status of every step,
including any skipped steps. The wrap-up SHALL be produced without any model call. After
wrap-up the conversation SHALL return to the normal iteration state.

#### Scenario: Wrap-up lists per-step outcomes

- **WHEN** all steps have been driven to a terminal state
- **THEN** a wrap-up message lists each step with its outcome (完成 / 已跳过)
- **AND** no further orchestrated round starts

---

### Requirement: TL-06 Orchestration Scope and Persistence

**Priority**: P2

Orchestration state SHALL be ephemeral in-memory state. The approved plan message SHALL
persist through the existing message persistence channel and remain visible after reload;
orchestration progress SHALL NOT resume after a page reload. The user SHALL be able to
abort an in-flight orchestration at any time via the existing stop control, keeping all
already-written files.

#### Scenario: Reload does not resume orchestration

- **GIVEN** orchestration paused or in progress
- **WHEN** the page is reloaded
- **THEN** the plan message is restored but no orchestrated round resumes automatically

#### Scenario: Stop control aborts orchestration

- **WHEN** the user presses the existing stop control during a step round
- **THEN** the current round stops, orchestration ends, and written files remain available
