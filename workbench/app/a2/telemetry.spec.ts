import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTelemetryAnnotation, classifyCommand, generationTelemetry, type TelemetryAnnotation } from './telemetry';

describe('generation telemetry collector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T12:00:00Z'));
    generationTelemetry.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('classifyCommand (design D5)', () => {
    it('classifies install commands', () => {
      expect(classifyCommand('npm install')).toBe('install');
      expect(classifyCommand('pnpm install --frozen-lockfile')).toBe('install');
      expect(classifyCommand('npm i react')).toBe('install');
    });

    it('classifies start commands', () => {
      expect(classifyCommand('npm run start')).toBe('start');
      expect(classifyCommand('npm run dev')).toBe('start');
      expect(classifyCommand('pnpm start')).toBe('start');
    });

    it('classifies everything else as other', () => {
      expect(classifyCommand('node scripts/build.mjs')).toBe('other');
      expect(classifyCommand('echo done')).toBe('other');
    });
  });

  describe('round lifecycle (design D2)', () => {
    it('records the full timeline of a fresh round and computes phases', async () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.beginRequest(1000);
      generationTelemetry.startRound('m1');
      generationTelemetry.markFirstToken(1500);

      await generationTelemetry.streamEnd('m1', {
        serverTiming: { startedAt: 1000, firstVisibleTokenAt: 1500, endedAt: 4000 },
      });

      const round = generationTelemetry.getRound('m1');

      expect(round).toBeDefined();
      expect(round!.source).toBe('fresh');
      expect(round!.status).toBe('finalized');

      const annotation = buildTelemetryAnnotation(round!);

      expect(annotation.value.phases.waitMs).toBe(500);
      expect(annotation.value.phases.streamMs).toBe(2500);
      expect(annotation.value.phases.tailMs).toBeGreaterThanOrEqual(0);
    });

    it('does not overwrite an existing round on repeated startRound', () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1', 1000);

      generationTelemetry.setRoundSource('replay');

      const again = generationTelemetry.startRound('m1', 9999);

      expect(again.source).toBe('fresh');
      expect(again.startedAt).toBe(1000);
    });
  });

  describe('fresh vs replay (task 2.2)', () => {
    it('marks replay rounds and never persists them', async () => {
      const persist = vi.fn();
      generationTelemetry.setPersistHandler(persist);

      generationTelemetry.setRoundSource('replay');
      generationTelemetry.startRound('m-replay');
      await generationTelemetry.streamEnd('m-replay');

      // perf-report B3: an action-less replay round waits out the settle window first
      expect(generationTelemetry.getRound('m-replay')!.status).toBe('stream-ended');

      await vi.advanceTimersByTimeAsync(30_001);

      expect(generationTelemetry.getRound('m-replay')!.status).toBe('finalized');
      expect(persist).not.toHaveBeenCalled();
    });

    it('persists fresh rounds through the registered handler', async () => {
      const persist = vi.fn();
      generationTelemetry.setPersistHandler(persist);

      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m-fresh', 1000);
      await generationTelemetry.streamEnd('m-fresh');

      expect(persist).toHaveBeenCalledTimes(1);

      const [messageId, annotation] = persist.mock.calls[0];

      expect(messageId).toBe('m-fresh');
      expect(annotation.type).toBe('telemetry');
      expect(annotation.value.source).toBe('fresh');
      expect(annotation.value.version).toBe(1);
    });
  });

  describe('action recording (task 2.1)', () => {
    it('records shell actions with truncated command, classification and exit code', () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1');

      const longCommand = `npm install ${'x'.repeat(500)}`;
      generationTelemetry.recordActionStart('m1', 'a0', 'shell', longCommand);

      let round = generationTelemetry.getRound('m1')!;
      expect(round.actions).toHaveLength(1);
      expect(round.actions[0].command).toHaveLength(200);
      expect(round.actions[0].commandClass).toBe('install');
      expect(round.actions[0].status).toBe('running');

      generationTelemetry.recordActionEnd('m1', 'a0', 'complete', 0);

      round = generationTelemetry.getRound('m1')!;
      expect(round.actions[0].status).toBe('complete');
      expect(round.actions[0].exitCode).toBe(0);
      expect(round.actions[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('records file and start actions without command fields', () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1');

      generationTelemetry.recordActionStart('m1', 'a0', 'file');
      generationTelemetry.recordActionEnd('m1', 'a0', 'complete');
      generationTelemetry.recordActionStart('m1', 'a1', 'start', 'npm run start');
      generationTelemetry.recordActionEnd('m1', 'a1', 'failed', 1);

      const round = generationTelemetry.getRound('m1')!;

      expect(round.actions[0]).toMatchObject({ type: 'file', status: 'complete' });
      expect(round.actions[0].command).toBeUndefined();
      expect(round.actions[1]).toMatchObject({ type: 'start', commandClass: 'start', status: 'failed', exitCode: 1 });
    });

    it('ignores duplicate action starts (streaming file writes)', () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1');

      generationTelemetry.recordActionStart('m1', 'a0', 'file');
      generationTelemetry.recordActionStart('m1', 'a0', 'file');

      expect(generationTelemetry.getRound('m1')!.actions).toHaveLength(1);
    });
  });

  describe('preview pairing and finalization (tasks 3.1/3.3)', () => {
    it('waits for the preview grace window when a start action ran', async () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1', 0);
      generationTelemetry.recordActionStart('m1', 'a0', 'start', 'npm run start');
      generationTelemetry.recordActionEnd('m1', 'a0', 'complete', 0);

      vi.setSystemTime(new Date('2026-08-11T12:00:05Z'));
      await generationTelemetry.streamEnd('m1');

      let round = generationTelemetry.getRound('m1')!;
      expect(round.status).toBe('draining');

      vi.setSystemTime(new Date('2026-08-11T12:00:08Z'));
      generationTelemetry.previewPortChanged(3000, true);

      round = generationTelemetry.getRound('m1')!;
      expect(round.status).toBe('finalized');
      expect(round.preview.openedAt).toBeDefined();
      expect(round.preview.startToPreviewMs).toBeGreaterThan(0);
      expect(round.preview.timeout).toBeUndefined();
    });

    it('times out the grace window when no preview opens', async () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1', 0);
      generationTelemetry.recordActionStart('m1', 'a0', 'start', 'npm run start');
      generationTelemetry.recordActionEnd('m1', 'a0', 'complete', 0);

      await generationTelemetry.streamEnd('m1');
      expect(generationTelemetry.getRound('m1')!.status).toBe('draining');

      await vi.advanceTimersByTimeAsync(30_001);

      const round = generationTelemetry.getRound('m1')!;
      expect(round.status).toBe('finalized');
      expect(round.preview.timeout).toBe(true);
    });

    it('finalizes immediately without a start action', async () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1', 0);
      generationTelemetry.recordActionStart('m1', 'a0', 'file');
      generationTelemetry.recordActionEnd('m1', 'a0', 'complete');

      await generationTelemetry.streamEnd('m1');

      expect(generationTelemetry.getRound('m1')!.status).toBe('finalized');
    });

    it('finalizes immediately when a preview is already open (incremental rounds)', async () => {
      generationTelemetry.previewPortChanged(3000, true);

      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m2', 0);
      generationTelemetry.recordActionStart('m2', 'a0', 'start', 'npm run start');
      generationTelemetry.recordActionEnd('m2', 'a0', 'complete', 0);

      await generationTelemetry.streamEnd('m2');

      expect(generationTelemetry.getRound('m2')!.status).toBe('finalized');

      generationTelemetry.previewPortChanged(3000, false);
    });

    it('waits for the drain promise before finalizing', async () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1', 0);

      let releaseDrain: () => void = () => undefined;
      const drain = new Promise<void>((resolve) => {
        releaseDrain = resolve;
      });

      const streamEnded = generationTelemetry.streamEnd('m1', { drain: () => drain });
      await Promise.resolve();

      expect(generationTelemetry.getRound('m1')!.status).toBe('stream-ended');

      releaseDrain();
      await streamEnded;

      expect(generationTelemetry.getRound('m1')!.status).toBe('finalized');
    });

    it('does not let a running start action block the drain (perf-report B1)', async () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1', 0);

      // the dev server runs indefinitely; it must not keep the round stuck
      generationTelemetry.recordActionStart('m1', 'a0', 'start', 'npm run dev');

      await generationTelemetry.streamEnd('m1');

      expect(generationTelemetry.getRound('m1')!.status).toBe('draining');

      await vi.advanceTimersByTimeAsync(30_001);

      const round = generationTelemetry.getRound('m1')!;
      expect(round.status).toBe('finalized');
      expect(round.preview.timeout).toBe(true);
    });

    it('keeps an install-only round in the grace window for the queued start action (perf-report B2)', async () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1', 0);
      generationTelemetry.recordActionStart('m1', 'a0', 'shell', 'npm install');
      generationTelemetry.recordActionEnd('m1', 'a0', 'complete', 0);

      await generationTelemetry.streamEnd('m1');

      // no start action recorded yet, but the install marks a bootstrap round
      expect(generationTelemetry.getRound('m1')!.status).toBe('draining');

      // the start action dequeues late and the preview opens inside the window
      generationTelemetry.recordActionStart('m1', 'a1', 'start', 'npm run dev');

      vi.setSystemTime(new Date('2026-08-11T12:00:08Z'));
      generationTelemetry.previewPortChanged(3000, true);

      const round = generationTelemetry.getRound('m1')!;
      expect(round.status).toBe('finalized');
      expect(round.preview.openedAt).toBeDefined();
      expect(round.preview.timeout).toBeUndefined();
    });

    it('keeps a replay round open while actions trickle in behind the queue (perf-report B3)', async () => {
      generationTelemetry.setRoundSource('replay');
      generationTelemetry.startRound('m1', 0);

      await generationTelemetry.streamEnd('m1');
      expect(generationTelemetry.getRound('m1')!.status).toBe('stream-ended');

      // a fast file action completes while install/start are still queued: must NOT finalize yet
      generationTelemetry.recordActionStart('m1', 'a0', 'file');
      generationTelemetry.recordActionEnd('m1', 'a0', 'complete');
      expect(generationTelemetry.getRound('m1')!.status).toBe('stream-ended');

      // install lands late: the settle window yields to the normal drain/grace flow
      generationTelemetry.recordActionStart('m1', 'a1', 'shell', 'npm install');
      generationTelemetry.recordActionEnd('m1', 'a1', 'complete', 0);

      expect(generationTelemetry.getRound('m1')!.status).toBe('draining');

      await vi.advanceTimersByTimeAsync(30_001);

      const round = generationTelemetry.getRound('m1')!;
      expect(round.status).toBe('finalized');
      expect(round.actions).toHaveLength(2);
    });
  });

  describe('interrupts (task 4.2)', () => {
    it('records interrupts on the active round and unclosed artifacts at stream end', async () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1', 0);

      generationTelemetry.recordInterrupt('abort');
      await generationTelemetry.streamEnd('m1', { unclosed: true });

      const round = generationTelemetry.getRound('m1')!;
      expect(round.interrupts.map((interrupt) => interrupt.kind)).toEqual(['abort', 'unclosed-artifact']);
    });
  });

  describe('annotation size cap (task 5.1)', () => {
    it('drops action commands when the annotation exceeds 8KB', () => {
      generationTelemetry.setRoundSource('fresh');
      generationTelemetry.startRound('m1', 0);

      for (let i = 0; i < 60; i++) {
        generationTelemetry.recordActionStart('m1', `a${i}`, 'shell', `npm install ${'y'.repeat(190)}`);
        generationTelemetry.recordActionEnd('m1', `a${i}`, 'complete', 0);
      }

      const round = generationTelemetry.getRound('m1')!;
      const raw = JSON.stringify({ type: 'telemetry', value: round });

      expect(raw.length).toBeGreaterThan(8 * 1024);

      const annotation: TelemetryAnnotation = buildTelemetryAnnotation(round);

      expect(JSON.stringify(annotation).length).toBeLessThanOrEqual(8 * 1024);
      expect(annotation.value.actions.every((action) => action.command === undefined)).toBe(true);
      expect(annotation.value.actions).toHaveLength(60);
    });
  });

  describe('snapshot restore telemetry (replay-snapshot-cache design D7)', () => {
    it('attaches a stashed restore outcome to the first round and the annotation', () => {
      generationTelemetry.setRoundSource('replay');
      generationTelemetry.recordRestore({ hit: true, durationMs: 1200, fallback: 'none' });

      generationTelemetry.startRound('m1', 0);
      generationTelemetry.startRound('m2', 100);

      expect(generationTelemetry.getRound('m1')!.restore).toEqual({ hit: true, durationMs: 1200, fallback: 'none' });
      expect(generationTelemetry.getRound('m2')!.restore).toBeUndefined();

      const annotation = buildTelemetryAnnotation(generationTelemetry.getRound('m1')!);

      expect(annotation.value.restore).toEqual({ hit: true, durationMs: 1200, fallback: 'none' });
    });

    it('finalizes a restored replay round that has a start action but no install action', async () => {
      generationTelemetry.setRoundSource('replay');
      generationTelemetry.recordRestore({ hit: true, durationMs: 900, fallback: 'none' });
      generationTelemetry.startRound('m1', 0);

      await generationTelemetry.streamEnd('m1');
      expect(generationTelemetry.getRound('m1')!.status).toBe('stream-ended');

      // install was skipped: only the start action lands
      generationTelemetry.recordActionStart('m1', 'a1', 'start', 'npm run dev');
      expect(generationTelemetry.getRound('m1')!.status).toBe('draining');

      vi.setSystemTime(new Date('2026-08-11T12:00:05Z'));
      generationTelemetry.previewPortChanged(3000, true);

      const round = generationTelemetry.getRound('m1')!;
      expect(round.status).toBe('finalized');
      expect(round.preview.startToPreviewMs).toBeDefined();
      expect(round.actions.some((action) => action.commandClass === 'install')).toBe(false);
    });

    it('marks the restore as start-failed once the restored dev server fails', () => {
      generationTelemetry.setRoundSource('replay');
      generationTelemetry.recordRestore({ hit: true, durationMs: 900, fallback: 'none' });
      generationTelemetry.startRound('m1', 0);

      generationTelemetry.markRestoreStartFailed();

      expect(generationTelemetry.getRound('m1')!.restore!.fallback).toBe('start-failed');
    });
  });
});
