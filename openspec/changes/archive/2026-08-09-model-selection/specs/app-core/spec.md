# Delta for App Core

## MODIFIED Requirements

### Requirement: FR-01 Application Generation

**Priority**: P0

The system SHALL allow users to generate a Web application by entering a natural language
description. The system SHALL invoke LLM-powered agents to produce runnable code and render
it as a live preview.

The system SHALL allow users to **select the LLM model** from a dropdown before submitting
the prompt. Available models SHALL include Qwen3.8-Max and Kimi-K3 (via Alibaba Bailian).

#### Scenario: User generates an app with a selected model

- **GIVEN** a user on the home page
- **WHEN** the user selects a model from the dropdown (e.g., Qwen3.8-Max or Kimi-K3)
- **AND** enters a natural language description and clicks "Generate"
- **THEN** the system invokes the LLM pipeline using the selected model
- **AND** a live, interactive preview of the generated app is shown upon completion

#### Scenario: Default model selection

- **GIVEN** a user opens the home page
- **WHEN** the page loads
- **THEN** the model dropdown defaults to "Qwen3.8-Max"

#### Scenario: Model parameter passed to API

- **GIVEN** the user has selected a model and entered a prompt
- **WHEN** the request is sent to `POST /api/generate`
- **THEN** the request body includes the selected `model` field
- **AND** the pipeline uses the Alibaba Bailian endpoint for that model

## ADDED Requirements

### Requirement: NFR-06 Multi-Provider LLM Support

**Priority**: P1

The system SHALL abstract LLM providers so that Alibaba Bailian can be used alongside
existing OpenAI / Anthropic integrations. The Bailian provider SHALL use the
OpenAI-compatible chat completions endpoint at
`https://dashscope.aliyuncs.com/compatible-mode/v1`.

#### Scenario: Call Bailian provider

- **GIVEN** the selected model belongs to the `bailian` provider
- **WHEN** `callLLM()` is invoked with `provider: "bailian"` and a model ID
- **THEN** the system sends the request to the Bailian endpoint with `BAILIAN_API_KEY`
- **AND** returns the LLM response in the unified `LLMResponse` format

#### Scenario: Bailian API key missing

- **GIVEN** `BAILIAN_API_KEY` is not set
- **WHEN** a user selects a Bailian model and submits
- **THEN** the system returns a friendly error: "Please configure BAILIAN_API_KEY in .env.local"
