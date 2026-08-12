## 1. Server-Side SSE Parsing Core

- [x] 1.1 Create `workbench/app/lib/.server/llm/sse-parser.ts` — a pure function that takes a `Response` (from `fetch` to the gateway) and returns an async iterable of parsed SSE chunks: `{ delta?: { content?: string; reasoning_content?: string }, finish_reason?: string, usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }`. Handle partial `data:` line buffering across network chunks.
- [x] 1.2 Write a unit test for `sse-parser.ts` covering: normal text delta, reasoning delta, mixed deltas, `[DONE]` sentinel, usage-only final chunk, partial line reassembly, empty choices array.

## 2. DashScope Streaming Function

- [x] 2.1 Create `workbench/app/lib/.server/llm/dashscope-stream.ts` — exports `dashScopeStreamText(props)` that: resolves model/provider config (same as current `streamText`), builds the OpenAI-compatible request body, calls `/api/llm` via `fetch` with the internal token header, parses the response using `sse-parser.ts`, and returns a `ReadableStream<Uint8Array>` in AI SDK data-stream wire format.
- [x] 2.2 In `dashscope-stream.ts`, emit `8:[{"type":"reasoning","value":{"text":"<delta>"}}]\n` for buffered `reasoning_content` deltas (throttled to ~200ms intervals; the value MUST be a single-element array), and `0:"<delta>"\n` for each `content` delta. At stream end, emit `e:{"finishReason":"<reason>","isContinued":false}\n` (design D8 — preserves today's per-segment message splitting). Track accumulated text, `finishReason`, and `usage`. Call `onFinish({ text, finishReason, usage })` when the stream ends.
- [x] 2.3 In `dashscope-stream.ts`, expose an `onFirstReasoningToken?: () => void` callback invoked when the first `reasoning_content` delta is parsed (for TTRT tracking).

## 3. Wire Format Producer

- [x] 3.1 In `dashscope-stream.ts`, implement a helper `formatDataStreamLine(code: string, value: unknown): string` that produces `<code>:<JSON.stringify(value)>\n` (mirrors `formatDataStreamPart` in `@ai-sdk/ui-utils`). Use codes: `0` for text deltas (string value), `8` for reasoning annotations (array value), `e` for finish_step (object value).
- [x] 3.2 Verify the wire format by writing a manual test: feed a mock SSE response through `dashScopeStreamText`, decode the output `ReadableStream`, and assert the output contains `8:` (reasoning), `0:` (text), and trailing `e:` lines in the correct order, each parseable by `parseDataStreamPart` from `@ai-sdk/ui-utils`.

## 4. Integrate into `stream-text.ts`

- [x] 4.1 Modify `workbench/app/lib/.server/llm/stream-text.ts`: add a branch at the top — if `A2_ENABLE_BYOK` is false AND the resolved provider/model is the platform default (`OpenAILike` + `A2_DEFAULT_MODEL`, currently `glm-5.2`), call `dashScopeStreamText()` instead of `_streamText()`. Otherwise, fall back to the existing `_streamText` path unchanged.
- [x] 4.2 Update the `streamText` function's return type to be a union: the existing `_streamText` result (with `toDataStream()`) OR a `{ toDataStream: () => ReadableStream<Uint8Array> }` wrapper around the `dashScopeStreamText` output. This keeps `api.chat.ts`'s `result.toDataStream(...)` call working for both paths.
- [x] 4.3 Remove the `onFirstTextDelta`/`onChunk` logic from the `dashScopeStreamText` path (those are AI SDK callbacks). Instead, pass `onFirstTextDelta` and `onFirstReasoningToken` callbacks directly into `dashScopeStreamText`.

## 5. Update `api.chat.ts`

- [x] 5.1 Add `firstReasoningTokenAt: number | undefined` alongside `firstVisibleTokenAt`. Wire `onFirstReasoningToken` from `dashScopeStreamText` to set it.
- [x] 5.2 Include `firstReasoningTokenAt` in the timing annotation payload (inside `A2_ENABLE_RESPONSE_STATS` block), alongside the existing `firstVisibleTokenAt`.
- [x] 5.3 Verify the continuation segment logic still works: when `onFinish` reports `finishReason === 'length'`, the existing code calls `streamText()` again with continued messages — confirm this triggers `dashScopeStreamText` for the new segment too.
- [x] 5.4 Confirm the `SwitchableStream` source switch from `dashScopeStreamText` output to the usage annotation stream works correctly (the wire format is the same).

## 6. Client — Thinking State Machine

- [x] 6.1 In `workbench/app/components/chat/Chat.client.tsx`, extend the `RequestStatus` type to include `'thinking'`. Add transition logic: when `requestStatus === 'waiting'` and the last assistant message has a `reasoning`-type annotation, set `requestStatus('thinking')`.
- [x] 6.2 Update the existing `useEffect` (L267-L281) that watches `message.content` for streaming start: also check for reasoning annotations to trigger the `thinking` state. Keep the `streaming` transition when `message.content` grows.
- [x] 6.3 In `workbench/app/components/chat/ResponseStats.tsx`, add a "思考中… X.Xs" display for the `thinking` state (timer starts from `requestStartedAt`). Transition to "生成中…" when `streaming`.

## 7. Client — Reasoning Panel UI

- [x] 7.1 In `workbench/app/components/chat/AssistantMessage.tsx`, extract reasoning annotations: `annotations?.filter(a => a.type === 'reasoning')` and join their `value.text` fields.
- [x] 7.2 Render a `<details>` panel above `<Markdown>` content with summary "思考过程". Set `open` attribute when the message is the last assistant message and `requestStatus` is `thinking` (auto-expand during streaming). Omit `open` for historical/reloaded messages (collapsed by default).
- [x] 7.3 Style the panel: subtle background, smaller text, monospace or muted color to distinguish from answer. Add a max-height with overflow-y-auto for very long reasoning.
- [x] 7.4 Pass `requestStatus` and `isStreaming` props from `Chat.client.tsx` → `Messages.client.tsx` → `BaseChat.tsx` → `AssistantMessage.tsx` so the panel knows when to auto-expand. (These props may already be partially available via `requestStatus`.)

## 8. Telemetry Integration

- [x] 8.1 In `workbench/app/a2/telemetry.ts`, add `firstReasoningTokenAt` to the `TelemetryAnnotationValue` phases type. Record it during `startRound` / `markFirstToken` alongside `firstVisibleTokenAt`.
- [x] 8.2 Update the generation telemetry panel (`GenerationTelemetryPanel.tsx`) to display TTRT (time to first reasoning token) as a separate bar/label in the waterfall, before the existing TTFT bar.

## 9. End-to-End Testing

- [x] 9.1 Start the workbench dev server with `A2_ENABLE_GENERATION_TELEMETRY=true` and `A2_ENABLE_RESPONSE_STATS=true`. Send a chat prompt that triggers reasoning (e.g., "创建一个 todo 应用").
- [x] 9.2 Verify: (a) reasoning panel expands during thinking phase, (b) reasoning text streams in real time, (c) answer begins after reasoning, (d) "思考中… X.Xs" transitions to "生成中…", (e) stats line shows both TTRT and TTFT after completion.
- [ ] 9.3 Reload the page and verify: (a) reasoning panel is collapsed by default, (b) expanding shows the full reasoning text, (c) stats line is preserved.
- [ ] 9.4 Send a follow-up incremental prompt and verify: continuation segments work, reasoning appears for the new segment, no errors in console.
- [x] 9.5 Run `openspec validate --change dashscope-reasoning-stream` to verify spec compliance.
