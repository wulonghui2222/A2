import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// ─── LLM Provider Abstraction ──────────────────────────────────
// Supports OpenAI and Anthropic. Easily extendable to other providers.

export interface LLMOptions {
  provider?: "openai" | "anthropic" | "bailian";
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

const DEFAULT_PROVIDER = (process.env.LLM_PROVIDER as "openai" | "anthropic" | "bailian") || "openai";
const DEFAULT_MODEL = process.env.LLM_MODEL || "gpt-4o";

const BAILIAN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  options: LLMOptions
): Promise<LLMResponse> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = options.model || DEFAULT_MODEL;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
  });

  const content = response.choices[0]?.message?.content || "";
  return {
    content,
    model,
    usage: response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
        }
      : undefined,
  };
}

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  options: LLMOptions
): Promise<LLMResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = options.model || "claude-sonnet-4-20250514";

  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens || 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    content,
    model,
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
    },
  };
}

// ─── Bailian Provider (Alibaba DashScope, OpenAI-compatible) ────
async function callBailian(
  systemPrompt: string,
  userPrompt: string,
  options: LLMOptions
): Promise<LLMResponse> {
  const apiKey = process.env.BAILIAN_API_KEY;
  if (!apiKey) {
    throw new Error("Please configure BAILIAN_API_KEY in .env.local");
  }

  const client = new OpenAI({ apiKey, baseURL: BAILIAN_BASE_URL });
  const model = options.model || "qwen3-max";

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
  });

  const content = response.choices[0]?.message?.content || "";
  return {
    content,
    model,
    usage: response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
        }
      : undefined,
  };
}

// ─── Main LLM Call Function ────────────────────────────────────
export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: LLMOptions = {}
): Promise<LLMResponse> {
  const provider = options.provider || DEFAULT_PROVIDER;

  if (provider === "anthropic") {
    return callAnthropic(systemPrompt, userPrompt, options);
  }
  if (provider === "bailian") {
    return callBailian(systemPrompt, userPrompt, options);
  }
  return callOpenAI(systemPrompt, userPrompt, options);
}

// ─── Helper: Extract JSON from LLM response ────────────────────
export function extractJSON<T>(text: string): T | null {
  try {
    // Try to find JSON in the response (might be wrapped in markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;

    // Find the first { and last }
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start === -1 || end === -1) return null;

    return JSON.parse(jsonStr.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// ─── Helper: Extract HTML from LLM response ────────────────────
export function extractHTML(text: string): string {
  // Try to find HTML in markdown code blocks
  const htmlMatch = text.match(/```html\s*([\s\S]*?)```/i);
  if (htmlMatch) return htmlMatch[1].trim();

  // Try to find HTML starting with <!DOCTYPE or <html
  const doctypeMatch = text.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  if (doctypeMatch) return doctypeMatch[0];

  const htmlTagMatch = text.match(/<html[\s\S]*<\/html>/i);
  if (htmlTagMatch) return htmlTagMatch[0];

  // Fallback: return the raw text (might still be HTML)
  return text.trim();
}
