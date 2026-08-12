## Why

qwen3.8-max is a reasoning model that emits `reasoning_content` (thinking tokens) before the answer.
The current pipeline uses `@ai-sdk/openai@0.0.66` as the provider adapter, which does not parse
`reasoning_content` from the SSE stream — the thinking content is silently discarded at the SDK layer.
As a result, users stare at a blank screen for 6.7–75s (outlier 120s) while the model thinks, with zero
visible progress. This is the #1 bottleneck identified in the generation performance report
(`doc/generation-perf-report.md` §3, rank 1, ~50–65% of end-to-end time).

## What Changes

- Replace the `@ai-sdk/openai` provider with a custom DashScope streaming client that calls the
  existing `/api/llm` gateway directly via `fetch` and manually parses the SSE stream to extract both
  `reasoning_content` and `content` fields.
- Stream reasoning content to the client as AI SDK data-stream message annotations (`type: 'reasoning'`),
  so `useChat` on the client accumulates them in `message.annotations` without changes to the `useChat`
  consumption model.
- Render a collapsible "思考过程" (reasoning) section above the assistant message body, showing
  reasoning text streaming in real time during the thinking phase.
- Introduce a "thinking" UI state (`waiting → thinking → streaming → finished`) so the user sees
  the reasoning panel expand as soon as the first `reasoning_content` chunk arrives, instead of a
  blank screen.
- Add a `timeToFirstReasoningToken` (TTRT) metric alongside the existing `firstVisibleTokenAt` (TTFT)
  in the timing annotation, so both "when did thinking start" and "when did the answer start" are
  observable. The existing TTFT definition (first content token, not reasoning) is preserved per WB-09.
- Preserve all existing pipeline guarantees: gateway credential injection (LG-02), authentication
  (LG-03), continuation segments (maxTokens), telemetry collection, and message persistence.
- **BREAKING** (internal): the `OpenAILikeProvider.getModelInstance()` return for the platform default
  model is replaced by a `DashScopeStreamModel` that implements `LanguageModelV1` internally but uses
  raw `fetch` + SSE parsing instead of `@ai-sdk/openai`'s model adapter. BYOK paths are unaffected.

## Capabilities

### New Capabilities

- `reasoning-stream`: Streaming of model reasoning/thinking content (`reasoning_content`) from the
  LLM through the server to the client UI, including real-time display in a collapsible panel and a
  TTRT (time to first reasoning token) timing metric.

### Modified Capabilities

- `workbench`: WB-09 Response Stats — add "thinking" state to the request status state machine,
  add TTRT to the timing annotation, add reasoning panel rendering to AssistantMessage. The existing
  "First visible token definition" scenario is preserved (TTFT still measures to first content token,
  not reasoning).
- `llm-gateway`: LG-01 — the gateway already passes SSE through unchanged (including
  `reasoning_content`); add an explicit requirement that the gateway SHALL NOT strip or transform
  `reasoning_content` fields from upstream SSE chunks.

## Impact

- **Dependencies**: No new npm packages. Uses raw `fetch` + `ReadableStream` + `TransformStream`
  (all Web platform APIs available in the Remix/Cloudflare runtime). `dashscope-sdk-official` is NOT
  required — the gateway already provides the SSE passthrough; the new client just parses it.
- **Server-side code**:
  - `workbench/app/lib/.server/llm/stream-text.ts` — core rewrite: replace `_streamText` from `ai`
    with a custom streaming function that calls the gateway, parses SSE, and returns a result object
    with a `toDataStream()`-compatible interface.
  - `workbench/app/routes/api.chat.ts` — adapt to the new `streamText` return type; add TTRT
    tracking; add reasoning annotation writing during stream (not just at finish).
  - `workbench/app/lib/modules/llm/providers/openai-like.ts` — `getModelInstance` for the platform
    default model delegates to the new DashScope streaming client instead of `getOpenAILikeModel`.
- **Client-side code**:
  - `workbench/app/components/chat/AssistantMessage.tsx` — render collapsible reasoning panel from
    `message.annotations` of `type: 'reasoning'`.
  - `workbench/app/components/chat/Chat.client.tsx` — add "thinking" state between "waiting" and
    "streaming"; detect first reasoning annotation to transition.
  - `workbench/app/components/chat/ResponseStats.tsx` — show "思考中… X.Xs" during thinking phase
    (TTRT-based timer).
- **Specs**: New `reasoning-stream` spec; delta specs for `workbench` (WB-09) and `llm-gateway` (LG-01).
- **Non-goals**:
  - Does not change the model, prompt, or system prompt.
  - Does not add `enable_thinking` toggle (qwen3.8-max defaults to thinking on; toggle is a future
    enhancement).
  - Does not change the gateway's credential injection or auth model.
  - Does not replace `useChat` on the client — the AI SDK data stream protocol is preserved.
