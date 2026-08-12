# LLM Gateway 平台统一 LLM 接入

## Purpose

提供平台统一的 LLM 接入网关：以 OpenAI 兼容的流式代理端点转发请求至阿里云百炼，
平台密钥仅存在于服务端，用户无需自带任何 API key，登录后即可使用平台默认模型生成。

## Requirements

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

---

### Requirement: LG-02 Server-Side Key Injection

**Priority**: P0

The platform LLM credential SHALL be injected server-side from environment
configuration. The credential SHALL NOT be delivered to, stored in, or readable from
the browser. Users SHALL NOT be required (or allowed) to supply their own API keys.

#### Scenario: No key material in client

- **WHEN** inspecting any client-side request or configuration
- **THEN** no platform API key or upstream credential is present

#### Scenario: Missing server key

- **GIVEN** the server environment lacks the platform credential
- **WHEN** a generation request arrives
- **THEN** the endpoint returns a configuration error (5xx)
- **AND** no request is sent upstream

---

### Requirement: LG-03 Authentication Required

**Priority**: P0

The LLM endpoint SHALL reject requests without a valid authenticated session.

#### Scenario: Unauthenticated request

- **WHEN** a request arrives without a valid session
- **THEN** the endpoint responds 401 and performs no upstream call

---

### Requirement: LG-04 Platform Default Model

**Priority**: P0

The system SHALL designate a single platform default model (`qwen3.8-max` on
Bailian, verified against the Bailian console; configurable via environment). End users
SHALL NOT see provider selection or BYOK configuration; provider/model choice UI
SHALL be hidden.

#### Scenario: Generation uses default model

- **WHEN** the user sends a chat message without any model selection
- **THEN** the request is served by the configured platform default model

#### Scenario: BYOK UI hidden

- **WHEN** the user opens any settings surface
- **THEN** no API-key entry or provider selector is visible
