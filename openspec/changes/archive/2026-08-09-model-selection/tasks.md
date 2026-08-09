# Tasks: Model Selection

## 1. Backend — Bailian Provider (NFR-06)

- [x] 1.1 Create `src/lib/models.ts` with `MODEL_CATALOG` (Qwen3.8-Max, Kimi-K3)
- [x] 1.2 Add `callBailian()` to `src/lib/llm.ts` (DashScope OpenAI-compatible endpoint)
- [x] 1.3 Extend `LLMOptions.provider` type to include `"bailian"`
- [x] 1.4 Add `BAILIAN_API_KEY` to `.env.local` and `callLLM()` routing
- [x] 1.5 Add error handling for missing `BAILIAN_API_KEY`

## 2. API — Model Parameter Routing (FR-01)

- [x] 2.1 Update `POST /api/generate` to resolve provider from `MODEL_CATALOG`
- [x] 2.2 Pass selected `model` through to `runPipeline()` → `callLLM()` options

## 3. Frontend — Model Selector UI (FR-01)

- [x] 3.1 Add `<select>` model dropdown to `PromptInput` component
- [x] 3.2 Update `onSubmit` callback signature: `(prompt, model) => void`
- [x] 3.3 Update `useGenerationStore.startGeneration` to accept `model` param
- [x] 3.4 Update home page to pass `MODEL_CATALOG` to `PromptInput`

## 4. Testing & Verification

- [ ] 4.1 Verify Qwen3.8-Max generation end-to-end
- [ ] 4.2 Verify Kimi-K3 generation end-to-end
- [ ] 4.3 Verify missing API key error message
