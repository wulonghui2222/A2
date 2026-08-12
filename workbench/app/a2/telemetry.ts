import { map, type MapStore } from 'nanostores';

/*
 * add-generation-telemetry (design D1-D5): client-side collector for generation
 * pipeline timing. Bolt-native files only emit single-line taps into this
 * module; all collection logic lives here per the A2 grafting convention.
 *
 * Collection is always on (near-zero overhead: synchronous Date.now() taps);
 * the A2_ENABLE_GENERATION_TELEMETRY flag only gates the dev-only panel.
 */

export type TelemetrySource = 'fresh' | 'replay';

export type TelemetryActionType = 'file' | 'shell' | 'start';

export type TelemetryCommandClass = 'install' | 'start' | 'other';

export type TelemetryInterruptKind = 'llm-error' | 'abort' | 'segment-limit' | 'unclosed-artifact';

export type TelemetryActionStatus = 'running' | 'complete' | 'failed' | 'aborted';

export type TelemetryRoundStatus = 'streaming' | 'stream-ended' | 'draining' | 'finalized';

export interface TelemetryActionRecord {
  id: string;
  type: TelemetryActionType;
  command?: string;
  commandClass?: TelemetryCommandClass;
  startedAt: number;
  durationMs?: number;
  status: TelemetryActionStatus;
  exitCode?: number;
}

export interface TelemetryInterrupt {
  kind: TelemetryInterruptKind;
  at: number;
}

export interface TelemetryPreview {
  openedAt?: number;
  startToPreviewMs?: number;
  timeout?: boolean;
}

export interface TelemetryPhases {
  /** TTRT: time from request start to the first reasoning token. */
  thinkingMs?: number;
  waitMs?: number;
  streamMs?: number;
  tailMs?: number;
}

export interface TelemetryRound {
  messageId: string;
  source: TelemetrySource;
  status: TelemetryRoundStatus;
  startedAt: number;
  firstReasoningTokenAt?: number;
  firstTokenAt?: number;
  streamEndedAt?: number;
  actionsDrainedAt?: number;
  finalizedAt?: number;
  actions: TelemetryActionRecord[];
  preview: TelemetryPreview;
  interrupts: TelemetryInterrupt[];
  webcontainerBootMs?: number;
}

/** Server-authoritative timing from the WB-09 usage annotation (design D2). */
export interface TelemetryServerTiming {
  startedAt: number;
  firstReasoningTokenAt?: number;
  firstVisibleTokenAt?: number;
  endedAt: number;
}

export interface TelemetryStreamEndOptions {
  unclosed?: boolean;
  serverTiming?: TelemetryServerTiming;

  /** Resolves once the round's action queue has fully drained (design D2). */
  drain?: () => Promise<void>;
  at?: number;
}

export interface TelemetryAnnotationValue {
  version: 1;
  source: TelemetrySource;
  startedAt: number;
  phases: TelemetryPhases;
  actions: TelemetryActionRecord[];
  preview: TelemetryPreview;
  interrupts: TelemetryInterrupt[];
  webcontainerBootMs?: number;
}

export interface TelemetryAnnotation {
  type: 'telemetry';
  value: TelemetryAnnotationValue;
}

export type TelemetryPersistHandler = (messageId: string, annotation: TelemetryAnnotation) => Promise<void>;

const MAX_ROUNDS = 20;
const PREVIEW_GRACE_MS = 30_000;

/*
 * perf-report B3: replay actions re-queue asynchronously and can lag many
 * seconds behind stream end (queued behind npm install), so the settle window
 * is generous; a landing action cancels it immediately. It must outlast the
 * whole bootstrap re-execution, since later rounds only run once the queue
 * ahead of them (install + start) has finished.
 */
const REPLAY_SETTLE_MS = 30_000;
const COMMAND_MAX_LENGTH = 200;
const ANNOTATION_MAX_BYTES = 8 * 1024;

/** add-generation-telemetry (design D5): shell command classification. */
export function classifyCommand(command: string): TelemetryCommandClass {
  const normalized = command.trim().toLowerCase();

  if (/^(npm|pnpm|yarn)\s+(install|i\b|add)\b/.test(normalized)) {
    return 'install';
  }

  if (/^(npm|pnpm|yarn)\s+(run|start|dev)\b/.test(normalized)) {
    return 'start';
  }

  return 'other';
}

interface CollectorInternals {
  rounds: MapStore<Record<string, TelemetryRound>>;
  order: string[];
  currentSource: TelemetrySource;
  pendingStartedAt?: number;
  webcontainerBootMs?: number;
  openPreviewPorts: Set<number>;
  persistHandler?: TelemetryPersistHandler;
  graceTimers: Map<string, ReturnType<typeof setTimeout>>;
}

function createInternals(): CollectorInternals {
  return {
    rounds: map({}),
    order: [],
    currentSource: 'fresh',
    openPreviewPorts: new Set(),
    graceTimers: new Map(),
  };
}

/*
 * Survive Vite HMR the same way the bolt stores do (workbench.ts precedent);
 * under Vitest/SSR import.meta.hot is undefined and state starts fresh.
 */
const internals: CollectorInternals = import.meta.hot?.data.telemetryInternals ?? createInternals();

if (import.meta.hot) {
  import.meta.hot.data.telemetryInternals = internals;
}

function touchRound(messageId: string): TelemetryRound | undefined {
  const round = internals.rounds.get()[messageId];

  if (round) {
    // clone-on-write so nanostores subscribers see the update
    internals.rounds.setKey(messageId, { ...round });
  }

  return internals.rounds.get()[messageId];
}

function runningActionCount(round: TelemetryRound): number {
  /*
   * perf-report B1: the dev server start is a long-running side effect, not a
   * blocking action. Counting it would keep the round stuck at stream-ended
   * until the process exits.
   */
  return round.actions.filter(
    (action) => action.status === 'running' && action.type !== 'start' && action.commandClass !== 'start',
  ).length;
}

function proceedAfterDrain(round: TelemetryRound) {
  if (round.status !== 'stream-ended' || runningActionCount(round) > 0) {
    return;
  }

  const hasStartAction = round.actions.some((action) => action.type === 'start');
  const hasInstallAction = round.actions.some((action) => action.commandClass === 'install');

  /*
   * perf-report B3: replay re-executes its action queue asynchronously and
   * actions TRICKLE in long after stream end (a fast file action can complete
   * while install/start are still queued many seconds away). Until start or
   * install evidence exists (or the preview is already open), finalizing on
   * the spot would drop the whole action/preview picture, so grant a settle
   * window instead; a landing action cancels it and the timer re-drives once
   * evidence has arrived (or finalizes a genuinely action-less round).
   */
  if (
    round.source === 'replay' &&
    !hasStartAction &&
    !hasInstallAction &&
    internals.openPreviewPorts.size === 0 &&
    round.preview.openedAt === undefined
  ) {
    if (internals.graceTimers.has(round.messageId)) {
      return;
    }

    const timer = setTimeout(() => {
      internals.graceTimers.delete(round.messageId);

      const current = internals.rounds.get()[round.messageId];

      if (!current || current.status !== 'stream-ended') {
        return;
      }

      const nowHasStart = current.actions.some((action) => action.type === 'start');
      const nowHasInstall = current.actions.some((action) => action.commandClass === 'install');

      if (!nowHasStart && !nowHasInstall) {
        finalizeRound(round.messageId);
      } else {
        proceedAfterDrain(current);
      }
    }, REPLAY_SETTLE_MS);

    internals.graceTimers.set(round.messageId, timer);

    return;
  }

  round.status = 'draining';
  round.actionsDrainedAt = Date.now();

  // Preview already on screen (incremental rounds): there is no open event to wait for.
  if (internals.openPreviewPorts.size > 0 || round.preview.openedAt !== undefined) {
    finalizeRound(round.messageId);
    return;
  }

  /*
   * Design D2: a round with no start action finalizes immediately. perf-report
   * B2: "no start action yet" is not "no preview coming" -- the start action
   * may still be queued behind install/file actions, so a bootstrap round that
   * contains an install action waits for the preview grace window instead.
   */
  if (!hasStartAction && !hasInstallAction) {
    finalizeRound(round.messageId);
    return;
  }

  const timer = setTimeout(() => {
    internals.graceTimers.delete(round.messageId);

    const current = internals.rounds.get()[round.messageId];

    if (current && current.status === 'draining' && current.preview.openedAt === undefined) {
      current.preview.timeout = true;
      finalizeRound(round.messageId);
    }
  }, PREVIEW_GRACE_MS);

  internals.graceTimers.set(round.messageId, timer);
}

function computePhases(round: TelemetryRound): TelemetryPhases {
  const phases: TelemetryPhases = {};

  if (round.firstReasoningTokenAt !== undefined) {
    phases.thinkingMs = Math.max(0, round.firstReasoningTokenAt - round.startedAt);
  }

  if (round.firstTokenAt !== undefined) {
    phases.waitMs = Math.max(0, round.firstTokenAt - round.startedAt);
  }

  if (round.streamEndedAt !== undefined) {
    phases.streamMs = Math.max(0, round.streamEndedAt - (round.firstTokenAt ?? round.startedAt));
  }

  if (round.streamEndedAt !== undefined && round.finalizedAt !== undefined) {
    phases.tailMs = Math.max(0, round.finalizedAt - round.streamEndedAt);
  }

  return phases;
}

/** Design D3: build the annotation payload, trimming to the 8KB cap. */
export function buildTelemetryAnnotation(round: TelemetryRound): TelemetryAnnotation {
  const value: TelemetryAnnotationValue = {
    version: 1,
    source: round.source,
    startedAt: round.startedAt,
    phases: computePhases(round),
    actions: round.actions.map((action) => ({ ...action })),
    preview: { ...round.preview },
    interrupts: round.interrupts.map((interrupt) => ({ ...interrupt })),
    ...(round.webcontainerBootMs !== undefined ? { webcontainerBootMs: round.webcontainerBootMs } : {}),
  };

  let annotation: TelemetryAnnotation = { type: 'telemetry', value };

  if (JSON.stringify(annotation).length > ANNOTATION_MAX_BYTES) {
    value.actions = value.actions.map((action) => {
      const { command: _command, ...rest } = action;
      return rest as TelemetryActionRecord;
    });
    annotation = { type: 'telemetry', value: { ...value } };
  }

  if (JSON.stringify(annotation).length > ANNOTATION_MAX_BYTES) {
    value.actions = [];
    annotation = { type: 'telemetry', value: { ...value } };
  }

  return annotation;
}

function finalizeRound(messageId: string) {
  const round = internals.rounds.get()[messageId];

  if (!round || round.status === 'finalized') {
    return;
  }

  const timer = internals.graceTimers.get(messageId);

  if (timer !== undefined) {
    clearTimeout(timer);
    internals.graceTimers.delete(messageId);
  }

  round.status = 'finalized';
  round.finalizedAt = Date.now();
  round.webcontainerBootMs ??= internals.webcontainerBootMs;

  internals.rounds.setKey(messageId, { ...round });

  /*
   * Design D3: only fresh rounds are persisted; replay rounds stay in
   * memory so they never overwrite the original fresh annotation.
   */
  if (round.source === 'fresh' && internals.persistHandler) {
    // Promise.resolve guards against handlers that do not return a promise
    Promise.resolve(internals.persistHandler(messageId, buildTelemetryAnnotation(round))).catch((error) => {
      console.warn('Failed to persist telemetry annotation', error);
    });
  }
}

export const generationTelemetry = {
  rounds: internals.rounds as MapStore<Record<string, TelemetryRound>>,

  /** Task 2.2: parse source signal — live streaming is fresh, reload re-parse is replay. */
  setRoundSource(source: TelemetrySource) {
    internals.currentSource = source;
  },

  /** Round 0 boundary: the user just sent a message (assistant id unknown yet). */
  beginRequest(at: number = Date.now()) {
    internals.pendingStartedAt = at;
  },

  startRound(messageId: string, at?: number): TelemetryRound {
    const existing = internals.rounds.get()[messageId];

    if (existing) {
      return existing;
    }

    const round: TelemetryRound = {
      messageId,
      source: internals.currentSource,
      status: 'streaming',
      startedAt: at ?? internals.pendingStartedAt ?? Date.now(),
      actions: [],
      preview: {},
      interrupts: [],
    };

    internals.pendingStartedAt = undefined;
    internals.order.push(messageId);

    while (internals.order.length > MAX_ROUNDS) {
      const evicted = internals.order.shift();

      if (evicted !== undefined) {
        const { [evicted]: _dropped, ...rest } = internals.rounds.get();
        internals.rounds.set(rest);
      }
    }

    internals.rounds.setKey(messageId, round);

    return round;
  },

  getRound(messageId: string): TelemetryRound | undefined {
    return internals.rounds.get()[messageId];
  },

  /** Most recent round that has not finalized — target for context-free taps. */
  activeRound(): TelemetryRound | undefined {
    for (let i = internals.order.length - 1; i >= 0; i--) {
      const round = internals.rounds.get()[internals.order[i]];

      if (round && round.status !== 'finalized') {
        return round;
      }
    }

    return undefined;
  },

  markFirstToken(at: number = Date.now()) {
    const round = this.activeRound();

    if (round && round.firstTokenAt === undefined) {
      round.firstTokenAt = at;
      touchRound(round.messageId);
    }
  },

  /*
   * dashscope-reasoning-stream (task 8.1): TTRT tap. Reasoning annotations
   * arrive BEFORE the first visible token, so the round may not exist yet —
   * create it via startRound the same way recordActionStart does.
   */
  markFirstReasoningToken(messageId?: string, at: number = Date.now()) {
    const round = messageId ? this.startRound(messageId) : this.activeRound();

    if (round && round.firstReasoningTokenAt === undefined) {
      round.firstReasoningTokenAt = at;
      touchRound(round.messageId);
    }
  },

  /** Task 2.1: action start tap from ActionRunner (file actions start once). */
  recordActionStart(messageId: string | undefined, actionId: string, type: TelemetryActionType, command?: string) {
    const round = messageId ? this.startRound(messageId) : this.activeRound();

    if (!round || round.actions.some((action) => action.id === actionId)) {
      return;
    }

    const record: TelemetryActionRecord = {
      id: actionId,
      type,
      startedAt: Date.now(),
      status: 'running',
    };

    if (command !== undefined) {
      record.command = command.slice(0, COMMAND_MAX_LENGTH);
      record.commandClass = classifyCommand(command);
    }

    round.actions.push(record);
    touchRound(round.messageId);

    /*
     * perf-report B3: an action landing on a replay round still in its settle
     * window cancels the window -- the normal drain logic takes over. Grace
     * timers set during the draining status are the preview window and must
     * stay untouched.
     */
    const settleTimer = internals.graceTimers.get(round.messageId);

    if (settleTimer !== undefined && round.status === 'stream-ended') {
      clearTimeout(settleTimer);
      internals.graceTimers.delete(round.messageId);
      proceedAfterDrain(internals.rounds.get()[round.messageId] as TelemetryRound);
    }
  },

  /** Task 2.1: action end tap; triggers drain checks once the stream has ended. */
  recordActionEnd(messageId: string | undefined, actionId: string, status: TelemetryActionStatus, exitCode?: number) {
    const round = messageId ? internals.rounds.get()[messageId] : this.activeRound();

    if (!round) {
      return;
    }

    const record = round.actions.find((action) => action.id === actionId);

    if (!record || record.status !== 'running') {
      return;
    }

    record.status = status;
    record.durationMs = Date.now() - record.startedAt;

    if (exitCode !== undefined) {
      record.exitCode = exitCode;
    }

    touchRound(round.messageId);
    proceedAfterDrain(internals.rounds.get()[round.messageId] as TelemetryRound);
  },

  /** Task 3.1: PreviewsStore port event tap. */
  previewPortChanged(port: number, open: boolean, at: number = Date.now()) {
    if (!open) {
      internals.openPreviewPorts.delete(port);
      return;
    }

    internals.openPreviewPorts.add(port);

    /*
     * perf-report B3: during replay all rounds open at once and share one
     * execution queue, so the preview event arrives while earlier rounds are
     * still settling. Prefer a DRAINING round (one actively waiting for the
     * preview) over the plain latest round, otherwise the bootstrap round
     * times out while a later action-less round steals its pairing.
     */
    let round: TelemetryRound | undefined;

    for (const id of internals.order) {
      const candidate = internals.rounds.get()[id];

      if (candidate?.status === 'draining' && candidate.preview.openedAt === undefined) {
        round = candidate;
      }
    }

    if (!round) {
      const candidate = this.activeRound();

      if (candidate && candidate.preview.openedAt === undefined) {
        round = candidate;
      }
    }

    if (!round) {
      return;
    }

    round.preview.openedAt = at;

    // pair with the latest start action (design proposal: start → preview latency)
    const startAction = [...round.actions].reverse().find((action) => action.type === 'start');

    if (startAction) {
      round.preview.startToPreviewMs = Math.max(0, at - startAction.startedAt);
    }

    touchRound(round.messageId);

    if (round.status === 'draining') {
      finalizeRound(round.messageId);
    }
  },

  /** Task 3.2: WebContainer boot duration tap. */
  webContainerBoot(durationMs: number) {
    internals.webcontainerBootMs = durationMs;
  },

  /** Task 4.2: interruption events applied to the active round. */
  recordInterrupt(kind: TelemetryInterruptKind, at: number = Date.now()) {
    const round = this.activeRound();

    if (round) {
      round.interrupts.push({ kind, at });
      touchRound(round.messageId);
    }
  },

  /** Task 4.2: abort / LLM error — record the interrupt and end the stream so the round can finalize. */
  interruptActiveRound(kind: TelemetryInterruptKind) {
    const round = this.activeRound();

    if (!round) {
      return;
    }

    round.interrupts.push({ kind, at: Date.now() });
    touchRound(round.messageId);
    void this.streamEnd(round.messageId);
  },

  /**
   * Task 3.3/4.1: stream end boundary. Server timing (WB-09 usage annotation)
   * wins over client-side timestamps when available (design D2).
   */
  async streamEnd(messageId: string, options: TelemetryStreamEndOptions = {}) {
    const round = internals.rounds.get()[messageId] ?? this.startRound(messageId);

    // only a streaming round advances; later duplicate calls (dev re-parse, Chat onFinish) are ignored
    if (round.status !== 'streaming') {
      return;
    }

    if (options.serverTiming) {
      round.startedAt = options.serverTiming.startedAt;
      round.firstReasoningTokenAt = options.serverTiming.firstReasoningTokenAt ?? round.firstReasoningTokenAt;
      round.firstTokenAt = options.serverTiming.firstVisibleTokenAt ?? round.firstTokenAt;
      round.streamEndedAt = options.serverTiming.endedAt;
    } else {
      round.streamEndedAt = options.at ?? Date.now();
    }

    if (options.unclosed) {
      round.interrupts.push({ kind: 'unclosed-artifact', at: round.streamEndedAt });
    }

    round.status = 'stream-ended';
    touchRound(messageId);

    if (options.drain) {
      try {
        await options.drain();
      } catch {
        // drain failures must never block finalization
      }
    }

    proceedAfterDrain(internals.rounds.get()[messageId] as TelemetryRound);
  },

  /** Task 5.1: persistence hookup — ChatImpl registers the annotation save path. */
  setPersistHandler(handler?: TelemetryPersistHandler) {
    internals.persistHandler = handler;
  },

  /** Test/hmr helper: drop all rounds and timers. */
  reset() {
    for (const timer of internals.graceTimers.values()) {
      clearTimeout(timer);
    }

    internals.graceTimers.clear();
    internals.order.length = 0;
    internals.rounds.set({});
    internals.pendingStartedAt = undefined;
    internals.currentSource = 'fresh';
    internals.openPreviewPorts.clear();
    internals.webcontainerBootMs = undefined;
  },
};
