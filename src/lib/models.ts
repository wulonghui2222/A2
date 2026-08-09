// ─── Model Catalog ─────────────────────────────────────────────
// Central registry of available models for the UI dropdown and API routing.

export interface ModelEntry {
  /** API model ID sent to the LLM provider */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Which provider in callLLM() to use */
  provider: "openai" | "anthropic" | "bailian";
  /** Short description shown as tooltip or subtitle */
  description: string;
}

export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: "qwen3-max",
    name: "Qwen3.8-Max",
    provider: "bailian",
    description: "阿里通义千问，综合能力强",
  },
  {
    id: "kimi-k3",
    name: "Kimi-K3",
    provider: "bailian",
    description: "月之暗面 Kimi，推理能力强",
  },
];

/** Default model when none is selected */
export const DEFAULT_MODEL_ID = MODEL_CATALOG[0]?.id ?? "qwen3-max";

/** Look up a model entry by its API ID */
export function findModel(modelId: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}
