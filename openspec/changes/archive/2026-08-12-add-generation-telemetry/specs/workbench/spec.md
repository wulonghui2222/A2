## ADDED Requirements

### Requirement: WB-11 Generation Round Telemetry Collection
The system SHALL collect per-round telemetry for every chat generation round, covering: the time from sending the user message to the first visible token, the LLM streaming duration, every executed action (type, command summary, start time, duration, terminal status), the time from the start command to the preview port becoming ready, and the tail duration between stream end and completion of all queued actions. Rounds triggered by live streaming SHALL be marked as fresh; rounds re-executed from persisted message history after a page load or project re-open SHALL be marked as replay. Telemetry collection SHALL NOT alter generation, execution, or preview behavior, and SHALL add no user-visible overhead when the display panel is disabled.

#### Scenario: Fresh round records the full timeline
- **WHEN** a user sends a prompt and the assistant response streams, executes file/shell/start actions, and the preview port opens
- **THEN** the round's telemetry contains the wait, stream, per-action, start-to-preview, and tail timings, marked as source "fresh"

#### Scenario: Replayed round is marked separately
- **WHEN** a historical project is opened and its message history is re-parsed, causing actions to re-execute
- **THEN** the resulting telemetry rounds are marked as source "replay" and do not overwrite the persisted telemetry of the original fresh rounds

#### Scenario: Collection is behavior-neutral
- **WHEN** telemetry collection is active
- **THEN** action execution order, file writing, preview behavior, and persisted chat content remain identical to the pre-telemetry behavior

### Requirement: WB-12 Generation Interruption Event Recording
The system SHALL record interruption events on the affected generation round, including: LLM request failure, user-initiated abort, termination caused by the response segment limit, and a response stream that ends while an artifact or action remains unclosed. Each recorded event SHALL carry its kind and timestamp within the round timeline.

#### Scenario: Stream ends with an unclosed artifact
- **WHEN** the response stream terminates before the artifact's closing tag is received
- **THEN** the round's telemetry records an unclosed-artifact interruption with its timestamp

#### Scenario: User aborts mid-generation
- **WHEN** the user stops a generation that is streaming or executing actions
- **THEN** the round's telemetry records an abort interruption and the round is finalized with the data collected so far

### Requirement: WB-13 Telemetry Persistence as Message Annotations
The system SHALL persist the telemetry of each fresh round as an annotation attached to the corresponding assistant message through the existing message persistence channel, after the round is finalized. Telemetry annotations SHALL be additive and versioned; clients that do not understand the annotation SHALL ignore it without error. Replay rounds SHALL NOT be persisted.

#### Scenario: Telemetry survives reload
- **WHEN** a generation round has finalized and the project is reopened
- **THEN** the round's telemetry annotation is loaded together with the message history

#### Scenario: Oversized telemetry degrades gracefully
- **WHEN** a round's telemetry would exceed the defined size cap
- **THEN** the system drops the least essential fields to fit the cap instead of failing the persistence of the message

### Requirement: WB-14 Telemetry Panel Gating
The system SHALL provide a telemetry visualization panel that is disabled by default and controlled by a feature flag overridable via environment configuration. When disabled, the panel SHALL NOT render and SHALL NOT be discoverable by end users. When enabled, the panel SHALL render per-round timelines for recent fresh and replay rounds of the current session, including persisted telemetry of loaded messages.

#### Scenario: Panel hidden by default
- **WHEN** the telemetry feature flag is not enabled
- **THEN** no telemetry panel or entry point is rendered in the chat UI

#### Scenario: Panel shows fresh and replay rounds
- **WHEN** the telemetry feature flag is enabled and rounds have been collected
- **THEN** the panel displays each round's timeline segments (wait, stream, actions, preview) and interruption markers, distinguishing fresh from replay rounds
