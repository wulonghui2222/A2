## MODIFIED Requirements

### Requirement: LG-01 OpenAI-Compatible Streaming Proxy

**Priority**: P0

The system SHALL expose a server-side endpoint accepting OpenAI chat-completions
formatted requests and streaming responses back as Server-Sent Events. The endpoint
SHALL forward requests to the Alibaba Bailian OpenAI-compatible upstream. The endpoint
SHALL pass through all fields present in upstream SSE chunks without modification,
including `reasoning_content` fields produced by reasoning-capable models.

#### Scenario: Streaming completion

- **GIVEN** an authenticated user generating in the workbench
- **WHEN** the client submits a chat-completions request with `stream: true`
- **THEN** the endpoint streams SSE chunks back until completion
- **AND** the workbench renders the streamed tokens incrementally

#### Scenario: Reasoning content passthrough

- **GIVEN** the upstream model produces `reasoning_content` in SSE delta chunks
- **WHEN** the gateway forwards the upstream response to the client
- **THEN** the `reasoning_content` field is preserved in the SSE chunk
- **AND** the gateway does not strip, transform, or rename the `reasoning_content` field

#### Scenario: Upstream error propagation

- **WHEN** the upstream returns an error (quota, invalid model, rate limit)
- **THEN** the endpoint returns an error in OpenAI-compatible error shape
- **AND** the workbench displays a friendly error with retry path
