/*
 * add-multi-agent-team (task 3.2, design D3/D8): client for the PD planning
 * round. Streams /api/plan (AI SDK data-stream wire format), parses plan
 * steps incrementally, drops reasoning parts (MA-01), records round timing,
 * and offers user-only skip/abort (MA-05).
 */
import { useCallback, useRef, useState } from 'react';
import { parsePdPlanOutput, type PdPlanParseResult } from '~/a2/multi-agent/pd-plan-parser';
import type { PdPlanStepContext } from '~/a2/multi-agent/pd-planner';

export type PdPlanPhase = 'idle' | 'streaming' | 'done' | 'error' | 'skipped';

export type PdPlanOutcome = 'done' | 'skipped' | 'error';

export interface PdPlanRoundResult {
  outcome: PdPlanOutcome;
  text: string | null;
}

export interface PdPlanTiming {
  startedAt: number;
  firstTokenAt?: number;
  endedAt?: number;
}

export interface StartPlanOptions {
  mode: 'first' | 'incremental';
  message: string;
  feedback?: string;
  fileTree?: string[];
  currentPlan?: PdPlanStepContext[];
}

export interface UsePdPlanResult {
  phase: PdPlanPhase;
  rawText: string;
  steps: string[];
  selection: PdPlanParseResult['selection'];
  timing: PdPlanTiming | undefined;
  errorMessage: string | undefined;

  /** Resolves the round outcome; text is null when aborted/failed/skipped. */
  startPlan: (options: StartPlanOptions) => Promise<PdPlanRoundResult>;

  /** User pressed 跳过直接生成 while streaming (MA-05). */
  skip: () => void;
  reset: () => void;
}

/** Decode AI SDK data-stream wire lines into text deltas / control signals. */
function parseWireLine(line: string): { kind: 'text'; delta: string } | { kind: 'end' } | { kind: 'error'; message: string } | { kind: 'ignore' } {
  const colonIndex = line.indexOf(':');

  if (colonIndex <= 0) {
    return { kind: 'ignore' };
  }

  const code = line.slice(0, colonIndex);
  const payload = line.slice(colonIndex + 1);

  try {
    if (code === '0') {
      return { kind: 'text', delta: JSON.parse(payload) as string };
    }

    if (code === 'e') {
      return { kind: 'end' };
    }

    if (code === '3') {
      return { kind: 'error', message: JSON.parse(payload) as string };
    }
  } catch {
    // malformed wire line — ignore
  }

  // 8: (reasoning) and anything else are dropped on purpose (MA-01)
  return { kind: 'ignore' };
}

export function usePdPlan(): UsePdPlanResult {
  const [phase, setPhase] = useState<PdPlanPhase>('idle');
  const [rawText, setRawText] = useState('');
  const [timing, setTiming] = useState<PdPlanTiming | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const abortRef = useRef<AbortController | undefined>(undefined);
  const skippedRef = useRef(false);
  const timingRef = useRef<PdPlanTiming | undefined>(undefined);

  const parsed = parsePdPlanOutput(rawText);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = undefined;
    skippedRef.current = false;
    setPhase('idle');
    setRawText('');
    setTiming(undefined);
    setErrorMessage(undefined);
  }, []);

  const skip = useCallback(() => {
    skippedRef.current = true;
    abortRef.current?.abort();

    if (timingRef.current && timingRef.current.endedAt === undefined) {
      timingRef.current = { ...timingRef.current, endedAt: Date.now() };
      setTiming(timingRef.current);
    }

    setPhase('skipped');
  }, []);

  const startPlan = useCallback(async (options: StartPlanOptions): Promise<PdPlanRoundResult> => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    skippedRef.current = false;

    setPhase('streaming');
    setRawText('');
    setErrorMessage(undefined);

    const startedAt = Date.now();
    timingRef.current = { startedAt };
    setTiming(timingRef.current);

    let accumulated = '';

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`规划请求失败（${response.status}）`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf('\n');

        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line) {
            const part = parseWireLine(line);

            if (part.kind === 'text' && part.delta) {
              if (timingRef.current?.firstTokenAt === undefined) {
                timingRef.current = { ...timingRef.current!, firstTokenAt: Date.now() };
              }

              accumulated += part.delta;
              setRawText(accumulated);
            } else if (part.kind === 'error') {
              throw new Error(part.message || '规划调用失败');
            }
          }

          newlineIndex = buffer.indexOf('\n');
        }
      }

      if (skippedRef.current) {
        return { outcome: 'skipped', text: null };
      }

      timingRef.current = { ...timingRef.current!, endedAt: Date.now() };
      setTiming(timingRef.current);

      if (accumulated.trim().length === 0) {
        throw new Error('规划响应为空');
      }

      setPhase('done');

      return { outcome: 'done', text: accumulated };
    } catch (error: unknown) {
      if (skippedRef.current) {
        return { outcome: 'skipped', text: null };
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        return { outcome: 'skipped', text: null };
      }

      timingRef.current = { ...timingRef.current!, endedAt: Date.now() };
      setTiming(timingRef.current);
      setErrorMessage(error instanceof Error ? error.message : '规划调用失败');
      setPhase('error');

      return { outcome: 'error', text: null };
    }
  }, []);

  return {
    phase,
    rawText,
    steps: parsed.steps,
    selection: parsed.selection,
    timing,
    errorMessage,
    startPlan,
    skip,
    reset,
  };
}
