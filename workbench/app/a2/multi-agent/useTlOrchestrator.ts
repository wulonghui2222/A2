/*
 * add-multi-agent-team (tasks 4.1/4.3/4.4, design D9/D12/D15): the TL
 * orchestrator state machine. Deterministic client-side logic — ZERO model
 * calls. Drives any approved plan (first-generation or incremental) one step
 * per generation round: a step advances only after BOTH the stream ended
 * (onFinish) AND the workbench actions of that round settled (no
 * pending/running, none failed, settle window elapsed). Any failure pauses
 * immediately; retry/skip/terminate are user-only decisions.
 */
import { useEffect, useRef, useState } from 'react';
import { generationTelemetry, type TelemetryRound } from '~/a2/telemetry';
import { buildStepInstruction } from './buildStepInstruction';
import type { TlStepStatus } from './plan-model';

export type TlPhase =
  | 'idle'
  | 'planning'
  | 'gate'
  | 'executing'
  | 'settling'
  | 'paused'
  | 'completed'
  | 'terminated';

export interface TlStepState {
  text: string;
  status: TlStepStatus;
}

export interface UseTlOrchestratorOptions {
  /** Launch one generation round with the hidden per-step instruction. */
  runStepRound: (instruction: string) => void;

  /** Persist the deterministic wrap-up assistant message (D15 / TL-05). */
  appendWrapUpMessage: (summary: string) => void;

  /** Quiet window after actions drain before a step counts as done (TL-02). */
  settleWindowMs?: number;

  /** Telemetry tap (task 6.1): fired right before each step round launches. */
  onStepRoundStart?: (stepIndex: number) => void;
}

export interface UseTlOrchestratorResult {
  phase: TlPhase;
  steps: TlStepState[];
  currentIndex: number;

  /** Present while paused: why the current step failed. */
  failReason?: string;

  startPlanning: () => void;
  proposePlan: (stepTexts: string[]) => void;
  approve: () => void;
  pause: () => void;
  resume: () => void;
  retryStep: () => void;
  skipStep: () => void;
  terminate: () => void;
  reset: () => void;
  onRoundFinished: (messageId: string) => void;
  onRoundError: (reason?: string) => void;
}

const DEFAULT_SETTLE_WINDOW_MS = 2_500;

const TERMINAL_PHASES: TlPhase[] = ['completed', 'terminated', 'idle'];

/**
 * Design D9: long-running `start` actions are side effects, not blockers
 * (same rule as telemetry's runningActionCount).
 */
function roundBlockingActions(round: TelemetryRound): { running: number; failed: number } {
  let running = 0;
  let failed = 0;

  for (const action of round.actions) {
    if (action.status === 'failed') {
      failed++;
    } else if (action.status === 'running' && action.type !== 'start' && action.commandClass !== 'start') {
      running++;
    }
  }

  return { running, failed };
}

/** TL-05: deterministic wrap-up text — no model call, Chinese copy. */
export function buildWrapUpSummary(steps: TlStepState[]): string {
  const done = steps.filter((step) => step.status === 'done');
  const skipped = steps.filter((step) => step.status === 'skipped');
  const failed = steps.filter((step) => step.status === 'failed');

  const lines: string[] = ['TL：计划执行完毕。'];

  lines.push(`共 ${steps.length} 步：完成 ${done.length}，跳过 ${skipped.length}，失败 ${failed.length}。`);

  if (done.length > 0) {
    lines.push('', '已完成：');
    done.forEach((step) => lines.push(`✓ ${step.text}`));
  }

  if (skipped.length > 0) {
    lines.push('', '已跳过：');
    skipped.forEach((step) => lines.push(`○ ${step.text}`));
  }

  if (failed.length > 0) {
    lines.push('', '未完成：');
    failed.forEach((step) => lines.push(`✗ ${step.text}`));
  }

  return lines.join('\n');
}

export function useTlOrchestrator(options: UseTlOrchestratorOptions): UseTlOrchestratorResult {
  const {
    runStepRound,
    appendWrapUpMessage,
    settleWindowMs = DEFAULT_SETTLE_WINDOW_MS,
    onStepRoundStart,
  } = options;

  const [phase, setPhase] = useState<TlPhase>('idle');
  const [steps, setSteps] = useState<TlStepState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [failReason, setFailReason] = useState<string | undefined>(undefined);

  // Mirrors for use inside store subscriptions / timers without stale closures.
  const phaseRef = useRef(phase);
  const stepsRef = useRef(steps);
  const indexRef = useRef(currentIndex);
  const failReasonRef = useRef(failReason);
  phaseRef.current = phase;
  stepsRef.current = steps;
  indexRef.current = currentIndex;
  failReasonRef.current = failReason;

  /*
   * The round to re-watch when resuming from a user pause: set when a round
   * finishes (either just before settling, or while the user is paused),
   * cleared whenever the orchestration moves past it.
   */
  const resumeRoundIdRef = useRef<string | undefined>(undefined);

  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  const clearSettleWatch = () => {
    if (settleTimerRef.current !== undefined) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = undefined;
    }

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = undefined;
    }
  };

  useEffect(() => clearSettleWatch, []);

  const setStepStatus = (index: number, status: TlStepStatus) => {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, status } : step)));
  };

  /** Mark step done and drive the next round, or finish the whole plan. */
  const advanceFrom = (index: number) => {
    resumeRoundIdRef.current = undefined;
    const stepsNow = stepsRef.current.map((step, i) =>
      i === index && step.status !== 'skipped' && step.status !== 'failed' ? { ...step, status: 'done' as TlStepStatus } : step,
    );

    setSteps(stepsNow);

    const next = index + 1;

    if (next >= stepsNow.length) {
      setPhase('completed');
      appendWrapUpMessage(buildWrapUpSummary(stepsNow));
      return;
    }

    setCurrentIndex(next);
    setPhase('executing');
    setSteps(stepsNow.map((step, i) => (i === next ? { ...step, status: 'running' as TlStepStatus } : step)));
    onStepRoundStart?.(next);
    runStepRound(buildStepInstruction(stepsNow.map(({ text }) => ({ text })), next));
  };

  const pauseAt = (index: number, reason: string) => {
    clearSettleWatch();
    resumeRoundIdRef.current = undefined;
    setStepStatus(index, 'failed');
    setFailReason(reason);
    setPhase('paused');
  };

  /** User-initiated pause: hold advancement; the live round may still finish. */
  const pause = () => {
    if (phaseRef.current !== 'executing' && phaseRef.current !== 'settling') {
      return;
    }

    /*
     * Sync the ref before setState: if the stream's onFinish lands before
     * the next render, onRoundFinished must see `paused` (and record the
     * round for resume) instead of advancing through the settle watch.
     */
    phaseRef.current = 'paused';
    clearSettleWatch();
    setFailReason(undefined);
    setPhase('paused');
  };

  /**
   * Resume from a user pause. If the paused round already finished (or the
   * pause happened during settling), re-enter the settle watch for it;
   * otherwise the stream is still live and the normal onFinish path applies.
   */
  const resume = () => {
    if (phaseRef.current !== 'paused' || failReasonRef.current) {
      return;
    }

    const roundId = resumeRoundIdRef.current;

    if (roundId) {
      phaseRef.current = 'settling';
      setPhase('settling');
      watchRound(roundId);
    } else {
      /*
       * The stream is still live: sync the ref so an onFinish landing
       * before the next render takes the normal settle path instead of
       * being recorded as a paused round nobody re-watches.
       */
      phaseRef.current = 'executing';
      setPhase('executing');
    }
  };

  /*
   * TL-02 settle watch: after the stream ended, evaluate the round's action
   * picture on every telemetry change. Any failed action pauses immediately;
   * zero blocking actions starts (or restarts) the settle window; a landing
   * action cancels it.
   *
   * Note: watchRound is only reached from onRoundFinished, which must sync
   * phaseRef to `settling` before calling it (setState alone is not visible
   * until the next render). evaluate() must also never unsubscribe just
   * because the phase is momentarily stale — otherwise a round whose actions
   * already drained gets no further telemetry ticks and the watch dies
   * silently. pauseAt/terminate/reset clear the watch explicitly.
   */
  const watchRound = (messageId: string) => {
    clearSettleWatch();

    const evaluate = () => {
      if (phaseRef.current !== 'settling') {
        // Stale phase or a user action intervened; the watch is cleared by
        // pauseAt/terminate/reset, so just skip this tick.
        return;
      }

      const round = generationTelemetry.getRound(messageId);

      // A step producing no actions (e.g. pure copy tweaks) still completes.
      if (!round || round.actions.length === 0) {
        scheduleSettle();
        return;
      }

      const { running, failed } = roundBlockingActions(round);

      if (failed > 0) {
        pauseAt(indexRef.current, '步骤执行中出现失败的命令');
        return;
      }

      if (running > 0) {
        // Actions still in flight: cancel any pending settle timer.
        if (settleTimerRef.current !== undefined) {
          clearTimeout(settleTimerRef.current);
          settleTimerRef.current = undefined;
        }

        return;
      }

      scheduleSettle();
    };

    const scheduleSettle = () => {
      if (settleTimerRef.current !== undefined) {
        return;
      }

      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = undefined;

        if (phaseRef.current !== 'settling') {
          return;
        }

        const round = generationTelemetry.getRound(messageId);

        if (round) {
          const { running, failed } = roundBlockingActions(round);

          if (failed > 0 || running > 0) {
            evaluate();
            return;
          }
        }

        clearSettleWatch();
        advanceFrom(indexRef.current);
      }, settleWindowMs);
    };

    evaluate();
    unsubscribeRef.current = generationTelemetry.rounds.subscribe(evaluate);
  };

  const startPlanning = () => {
    clearSettleWatch();
    setFailReason(undefined);
    setSteps([]);
    setCurrentIndex(-1);
    setPhase('planning');
  };

  const proposePlan = (stepTexts: string[]) => {
    setSteps(stepTexts.map((text) => ({ text, status: 'pending' as TlStepStatus })));
    setCurrentIndex(-1);
    setPhase('gate');
  };

  /*
   * Gate → executing. Design D4: the step-1 round itself is launched by the
   * caller through the setMessages+reload path (plan message + hidden step
   * instruction); later rounds are launched here via runStepRound.
   */
  const approve = () => {
    if (phaseRef.current !== 'gate' || stepsRef.current.length === 0) {
      return;
    }

    setFailReason(undefined);
    setCurrentIndex(0);
    setPhase('executing');
    setStepStatus(0, 'running');
  };

  const retryStep = () => {
    if (phaseRef.current !== 'paused' || !failReasonRef.current) {
      return;
    }

    const index = indexRef.current;
    setFailReason(undefined);
    setStepStatus(index, 'running');
    setPhase('executing');
    onStepRoundStart?.(index);
    runStepRound(buildStepInstruction(stepsRef.current.map(({ text }) => ({ text })), index));
  };

  const skipStep = () => {
    if (phaseRef.current === 'paused' && !failReasonRef.current) {
      return;
    }

    if (phaseRef.current !== 'paused' && phaseRef.current !== 'settling') {
      return;
    }

    clearSettleWatch();
    setFailReason(undefined);

    const index = indexRef.current;
    setStepStatus(index, 'skipped');

    const stepsNow = stepsRef.current.map((step, i) => (i === index ? { ...step, status: 'skipped' as TlStepStatus } : step));
    setSteps(stepsNow);

    const next = index + 1;

    if (next >= stepsNow.length) {
      setPhase('completed');
      appendWrapUpMessage(buildWrapUpSummary(stepsNow));
      return;
    }

    setCurrentIndex(next);
    setPhase('executing');
    setSteps(stepsNow.map((step, i) => (i === next ? { ...step, status: 'running' as TlStepStatus } : step)));
    onStepRoundStart?.(next);
    runStepRound(buildStepInstruction(stepsNow.map(({ text }) => ({ text })), next));
  };

  /** TL-06 / D12: Stop button semantics during orchestration. */
  const terminate = () => {
    if (TERMINAL_PHASES.includes(phaseRef.current)) {
      return;
    }

    clearSettleWatch();
    resumeRoundIdRef.current = undefined;
    setPhase('terminated');
  };

  const reset = () => {
    clearSettleWatch();
    resumeRoundIdRef.current = undefined;
    setPhase('idle');
    setSteps([]);
    setCurrentIndex(-1);
    setFailReason(undefined);
  };

  /** Chat's onFinish tap; only rounds driven by this orchestrator are judged. */
  const onRoundFinished = (messageId: string) => {
    if (phaseRef.current === 'paused' && !failReasonRef.current) {
      // The stream ended while the user paused: remember the round so
      // resume() can re-enter the settle watch.
      resumeRoundIdRef.current = messageId;
      return;
    }

    if (phaseRef.current !== 'executing') {
      return;
    }

    /*
     * Sync the ref before watchRound: setState is not visible until the next
     * render, and watchRound's immediate evaluate() must see `settling`.
     */
    resumeRoundIdRef.current = messageId;
    phaseRef.current = 'settling';
    setPhase('settling');
    watchRound(messageId);
  };

  const onRoundError = (reason?: string) => {
    if (phaseRef.current === 'paused' && !failReasonRef.current) {
      // A user pause turns into a failure pause if the live round errors.
      setFailReason(reason || '生成流出错');
      return;
    }

    if (phaseRef.current !== 'executing' && phaseRef.current !== 'settling') {
      return;
    }

    pauseAt(indexRef.current, reason || '生成流出错');
  };

  return {
    phase,
    steps,
    currentIndex,
    failReason,
    startPlanning,
    proposePlan,
    approve,
    pause,
    resume,
    retryStep,
    skipStep,
    terminate,
    reset,
    onRoundFinished,
    onRoundError,
  };
}
