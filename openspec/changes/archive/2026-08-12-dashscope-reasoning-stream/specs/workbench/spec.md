## MODIFIED Requirements

### Requirement: WB-09 Response Observability

**Priority**: P1

The system SHALL present staged request status and time statistics for every chat
request in the workbench, so the user can distinguish waiting, thinking, streaming, finished,
and failed states at any moment. Time statistics SHALL be recorded server-side,
attached to the assistant message as an annotation, and persisted with the message
so they remain visible after reload. UI copy SHALL be in Chinese.

#### Scenario: Waiting phase feedback

- **WHEN** the user submits a message and the server has not yet produced visible assistant text or reasoning
- **THEN** the chat displays a waiting indicator with a live elapsed-time counter
- **AND** the indicator remains visible until the first reasoning token or answer text arrives or the request fails

#### Scenario: Thinking phase feedback

- **WHEN** the model begins emitting reasoning tokens (reasoning annotations arrive at the client)
- **THEN** the chat displays a "思考中" indicator with a live elapsed-time counter starting from request submission
- **AND** the reasoning panel expands to show streaming reasoning text
- **AND** the indicator transitions to "streaming" when the first answer content token arrives

#### Scenario: Streaming phase feedback

- **WHEN** visible assistant answer text begins streaming (after reasoning, if any)
- **THEN** the chat displays elapsed time, generated token count, and generation speed (tokens per second), updated while streaming

#### Scenario: Completion statistics

- **WHEN** a chat request completes successfully
- **THEN** the assistant message displays a statistics line with token counts, time to first reasoning token (if reasoning was produced), time to first visible token, total elapsed time, and generation speed
- **AND** the same statistics remain visible when the conversation is reopened or reloaded

#### Scenario: First visible token definition

- **WHEN** the upstream model emits reasoning tokens before content tokens
- **THEN** time to first visible token SHALL be measured from request start to the first content token rendered to the user, not the first transported chunk
- **AND** time to first reasoning token SHALL be measured from request start to the first reasoning token rendered to the user

#### Scenario: Continuation segments

- **WHEN** a request is completed through multiple continuation segments due to output length limits
- **THEN** the statistics SHALL report the number of segments, and total elapsed time SHALL cover all segments

#### Scenario: Failure recorded in message history

- **WHEN** a chat request fails at any stage
- **THEN** the failure is shown inline at the assistant message position with the error summary
- **AND** the failure state is persisted with the message so it is visible after reload
