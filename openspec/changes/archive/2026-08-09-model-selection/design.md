# Design: Model Selection — Qwen3.8-Max & Kimi-K3

## Architecture Changes

```
┌─────────────────────────────────────────────┐
│           Home Page (PromptInput)             │
│                                               │
│  [ Qwen3.8-Max ▼ ]   ┌──────────────────┐   │
│                       │ prompt textarea   │   │
│                       │               [→] │   │
│                       └──────────────────┘   │
└──────────────────────────┬───────────────────┘
                           │
                 POST /api/generate
                 { prompt, model: "qwen3-max" }
                           │
                           ▼
┌──────────────────────────────────────────────┐
│           callLLM() — Multi-Provider          │
│                                               │
│  provider = "openai"  →  OpenAI API           │
│  provider = "anthropic" →  Anthropic API       │
│  provider = "bailian" →  Bailian (DashScope)  │ ◄── NEW
│                        baseURL: dashscope...  │
│                        apiKey: BAILIAN_API_KEY │
└──────────────────────────────────────────────┘
```

## Model Registry

Centralized model catalog in `src/lib/models.ts`:

```ts
export const MODEL_CATALOG = [
  {
    id: "qwen3-max",
    name: "Qwen3.8-Max",
    provider: "bailian" as const,
    description: "阿里通义千问，综合能力强",
  },
  {
    id: "kimi-k3",
    name: "Kimi-K3",
    provider: "bailian" as const,
    description: "月之暗面 Kimi，推理能力强",
  },
];
```

The model catalog drives:
1. The dropdown in the UI (`PromptInput`)
2. The provider resolution in `callLLM()`

## LLM Provider — Bailian Implementation

Reuse existing `openai` SDK with custom `baseURL`:

```ts
function callBailian(systemPrompt, userPrompt, options) {
  const client = new OpenAI({
    apiKey: process.env.BAILIAN_API_KEY,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });
  // Same chat.completions.create call as OpenAI
}
```

No new npm dependencies required — the existing `openai` package supports any
OpenAI-compatible endpoint.

## API Changes

`POST /api/generate` already accepts an optional `model` field. The only change is:
- The client now sends the selected model ID in the request body
- The API resolves the model → provider via `MODEL_CATALOG` lookup
- If model not found in catalog, fallback to `DEFAULT_PROVIDER` + `DEFAULT_MODEL`

```ts
// API route
const catalogModel = MODEL_CATALOG.find(m => m.id === body.model);
const provider = catalogModel?.provider || DEFAULT_PROVIDER;
```

## Environment Variables

Add to `.env.local`:

```env
BAILIAN_API_KEY=sk-xxxxx
```

## Error Handling

If `BAILIAN_API_KEY` is not configured, the API returns a 500 with:
```json
{ "error": "Please configure BAILIAN_API_KEY in .env.local", "code": "MISSING_BAILIAN_KEY" }
```

## UI Component Changes

`PromptInput` gains an optional `models` prop:

```tsx
<PromptInput
  models={MODEL_CATALOG}
  defaultModel="qwen3-max"
  onSubmit={(prompt, model) => startGeneration(prompt, model)}
/>
```

The `<select>` dropdown sits above the textarea, styled consistently with the existing design.
