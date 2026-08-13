/*
 * add-multi-agent-team (task 3.5, design D13): iteration triage call.
 * Lightweight non-streaming /api/llmcall reuse; failure or timeout degrades
 * to null, which the caller maps onto the direct path (never blocks).
 */
import { buildTriageSystemPrompt } from './pd-planner';
import type { ProviderInfo } from '~/types/model';

export type TriageOutcome = 'trivial' | 'major';

const DEFAULT_TRIAGE_TIMEOUT_MS = 15_000;

/** Normalize a free-form model answer onto the fixed outcome set. */
export function parseTriageOutput(text: string): TriageOutcome | null {
  const normalized = text.trim().toLowerCase();

  if (normalized.includes('trivial')) {
    return 'trivial';
  }

  if (normalized.includes('major')) {
    return 'major';
  }

  return null;
}

export interface TriageOptions {
  message: string;
  projectSummary: string;
  model: string;
  provider: ProviderInfo;
  timeoutMs?: number;
}

/** Resolves the routing outcome, or null on failure/timeout (degrade to direct). */
export async function triageIterationMessage(options: TriageOptions): Promise<TriageOutcome | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TRIAGE_TIMEOUT_MS);

  try {
    const response = await fetch('/api/llmcall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: buildTriageSystemPrompt(options.projectSummary),
        message: options.message,
        model: options.model,
        provider: options.provider,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as { text?: unknown };
    const text = typeof result?.text === 'string' ? result.text : '';

    return parseTriageOutput(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
