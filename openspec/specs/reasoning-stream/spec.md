# Reasoning Stream 推理内容流式透传

## Purpose

Streams the reasoning/thinking content (`reasoning_content`) produced by reasoning-capable LLM models
from the server-side chat endpoint through the AI SDK data stream to the client UI, so users can
observe the model's thought process in real time instead of staring at a blank screen.

## Requirements

### Requirement: RS-01 Reasoning Content Extraction

**Priority**: P0

The system SHALL extract `reasoning_content` from the upstream LLM's SSE stream and stream it to
the client as a separate data stream part, distinct from the answer `content` text deltas. The
reasoning content SHALL arrive incrementally during the thinking phase, before the first answer
text delta.

#### Scenario: Reasoning streams before answer

- **GIVEN** the platform default model produces reasoning tokens before answer tokens
- **WHEN** the server-side streaming function receives an SSE chunk containing `reasoning_content`
- **THEN** the reasoning text is forwarded to the client data stream immediately
- **AND** it arrives before any answer `content` text delta

#### Scenario: No reasoning content from model

- **GIVEN** the model does not produce `reasoning_content` (e.g., thinking disabled or non-reasoning model)
- **WHEN** the SSE stream contains only `content` deltas
- **THEN** no reasoning data stream parts are emitted
- **AND** the chat behaves identically to the pre-change pipeline

#### Scenario: Partial SSE chunk boundaries

- **WHEN** an SSE `data:` line is split across multiple network chunks
- **THEN** the parser SHALL buffer incomplete lines and emit complete JSON-parsed chunks only
- **AND** no reasoning or content text is lost or duplicated

---

### Requirement: RS-02 Reasoning Content Transport

**Priority**: P0

The system SHALL transport reasoning content to the client via AI SDK data-stream message
annotations of type `reasoning`, so that `useChat` accumulates them in `message.annotations` without
requiring changes to the `useChat` consumption protocol. Each annotation SHALL contain a `text` field
with a reasoning text delta. Annotations SHALL be emitted incrementally during the thinking phase.

#### Scenario: Client receives reasoning annotations

- **GIVEN** the server is streaming reasoning content
- **WHEN** the client receives a `reasoning` annotation in the data stream
- **THEN** the annotation appears in `message.annotations` of the corresponding assistant message
- **AND** the annotation contains the reasoning text delta in its `text` field

#### Scenario: Reasoning annotations are additive

- **GIVEN** multiple reasoning annotations arrive during the thinking phase
- **WHEN** the client accumulates them
- **THEN** concatenating all `text` fields in arrival order produces the complete reasoning content
- **AND** reasoning annotations do not interfere with answer text deltas or usage annotations

---

### Requirement: RS-03 Reasoning Content Display

**Priority**: P0

The system SHALL render a collapsible "思考过程" panel above the assistant message body. The panel
SHALL expand automatically when the first reasoning annotation arrives and display reasoning text
streaming in real time. After the answer begins, the panel SHALL remain visible and collapsible.
The panel SHALL be collapsed by default when the conversation is reloaded from history.

#### Scenario: Real-time reasoning display

- **GIVEN** the user has submitted a prompt and the model is in the thinking phase
- **WHEN** the first reasoning annotation arrives at the client
- **THEN** a "思考过程" panel expands above the message body area
- **AND** reasoning text streams into the panel incrementally as annotations arrive

#### Scenario: Transition from thinking to answering

- **WHEN** the first answer text delta arrives after reasoning annotations
- **THEN** the reasoning panel remains visible but stops accepting new content
- **AND** the answer body begins streaming below the panel

#### Scenario: Reloaded conversation shows collapsed reasoning

- **GIVEN** a conversation with persisted reasoning annotations
- **WHEN** the conversation is reloaded from message history
- **THEN** the reasoning panel is rendered in a collapsed state with a toggle to expand
- **AND** expanding shows the full reasoning text

---

### Requirement: RS-04 Reasoning Timing Metric

**Priority**: P1

The system SHALL record a `firstReasoningTokenAt` timestamp in the server-side timing annotation,
measured from request start to the first received `reasoning_content` chunk. This is distinct from
`firstVisibleTokenAt` which measures time to the first answer content token.

#### Scenario: TTRT recorded in timing annotation

- **GIVEN** a request where the model produced reasoning content
- **WHEN** the request completes successfully
- **THEN** the timing annotation includes `firstReasoningTokenAt`
- **AND** `firstReasoningTokenAt` is earlier than or equal to `firstVisibleTokenAt`

#### Scenario: No reasoning, no TTRT

- **GIVEN** a request where the model produced no reasoning content
- **WHEN** the request completes
- **THEN** the timing annotation does not include `firstReasoningTokenAt`
- **AND** `firstVisibleTokenAt` is present as before
