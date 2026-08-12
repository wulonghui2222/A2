import { expect, test, type Page } from '@playwright/test';
import { mountNmStub } from './fixtures/nm-snapshot-stream';
import { registerUser } from './helpers/auth';

/*
 * replay-snapshot-cache (task 5.1, WB-15/WB-16): end-to-end coverage of the
 * snapshot cache on a real WebContainer boot:
 *   1. generation installs deps + opens the preview -> write-back lands
 *   2. reload replay restores the snapshot and skips the bootstrap install
 *   3. cache cleared -> replay misses, re-installs and writes back again
 * The LLM is stubbed; npm install hits the real registry (WebContainer boot
 * already requires network). Install-heavy, so the timeout is generous.
 */

interface E2eAction {
  type: string;
  commandClass?: string;
  status: string;
  exitCode?: number;
  durationMs?: number;
}

interface E2eRound {
  messageId: string;
  source: 'fresh' | 'replay' | string;
  status: string;
  startedAt: number;
  streamEndedAt?: number;
  actions: E2eAction[];
  preview: { openedAt?: number; startToPreviewMs?: number };
  restore?: { hit: boolean; durationMs?: number; fallback?: string };
}

type Rounds = Record<string, E2eRound>;

interface CacheState {
  entries: Array<{ key: string; sizeBytes: number }>;
  files: Array<{ name: string; size?: number }>;
}

async function dumpRounds(page: Page): Promise<Rounds> {
  return page.evaluate(async () => {
    // vite-dev absolute import; specifier kept in a variable so TS does not resolve it
    const specifier = '/app/a2/telemetry.ts';
    const mod = await import(specifier);

    return JSON.parse(JSON.stringify(mod.generationTelemetry.rounds.get()));
  });
}

/** The previews store is the source of truth for an open dev-server port. */
async function dumpPreviews(page: Page): Promise<Array<{ port: number; baseUrl: string }>> {
  return page.evaluate(async () => {
    const specifier = '/app/lib/stores/workbench.ts';
    const mod = await import(specifier);

    return JSON.parse(JSON.stringify(mod.workbenchStore.previews.get()));
  });
}

async function dumpCache(page: Page): Promise<CacheState> {
  return page.evaluate(async () => {
    const specifier = '/app/lib/runtime/snapshot-cache.ts';
    const mod = await import(specifier);
    const entries = await mod.snapshotCache.entries();
    const files: Array<{ name: string; size?: number }> = [];

    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('a2-nm-cache');
      const iter = (
        dir as FileSystemDirectoryHandle & {
          entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
        }
      ).entries();

      for await (const [name, handle] of iter) {
        files.push({
          name,
          size: handle.kind === 'file' ? (await (handle as FileSystemFileHandle).getFile()).size : undefined,
        });
      }
    } catch {
      // no cache dir yet
    }

    return JSON.parse(JSON.stringify({ entries, files }));
  });
}

/** Polls until pred(rounds) returns a value; fails the test on timeout. */
async function pollRounds<T>(
  page: Page,
  pred: (rounds: Rounds) => T | undefined,
  label: string,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: Rounds = {};

  while (Date.now() < deadline) {
    last = await dumpRounds(page).catch(() => last);

    const match = pred(last);

    if (match !== undefined) {
      return match;
    }

    await page.waitForTimeout(2000);
  }

  throw new Error(`timeout waiting for ${label}; last rounds: ${JSON.stringify(last)}`);
}

async function pollCache(page: Page, label: string, timeoutMs: number): Promise<CacheState> {
  const deadline = Date.now() + timeoutMs;
  let last: CacheState = { entries: [], files: [] };

  while (Date.now() < deadline) {
    last = await dumpCache(page).catch(() => last);

    if (last.entries.length > 0 && last.files.length > 0) {
      return last;
    }

    await page.waitForTimeout(2000);
  }

  throw new Error(`timeout waiting for ${label}; last cache: ${JSON.stringify(last)}`);
}

/**
 * Restore keys off the persisted package.json; wait until the server-side
 * fileSnapshot actually landed before reloading into a replay.
 */
async function waitForFileSnapshot(page: Page, chatUrl: string, timeoutMs: number): Promise<void> {
  const projectId = chatUrl.split('/chat/')[1];
  const deadline = Date.now() + timeoutMs;
  let lastProbe: unknown = undefined;

  while (Date.now() < deadline) {
    const probe = await page.evaluate(async (id) => {
      const res = await fetch(`/api/projects/${id}`);

      if (!res.ok) {
        return { status: res.status };
      }

      const data = (await res.json()) as { fileSnapshot?: string };

      let fileStoreKeys: string[] | undefined;

      try {
        const specifier = '/app/lib/stores/workbench.ts';
        const mod = await import(specifier);
        fileStoreKeys = Object.keys((mod as any).workbenchStore.files.get()).slice(0, 20);
      } catch {
        // store probe failed
      }

      if (!data.fileSnapshot) {
        return { status: res.status, fileSnapshot: false, fileStoreKeys };
      }

      let snapshotKeys: string[] | undefined;

      try {
        snapshotKeys = Object.keys(JSON.parse(data.fileSnapshot)).slice(0, 20);
      } catch {
        return { status: res.status, fileSnapshot: true, unparsable: true, fileStoreKeys };
      }

      return {
        status: res.status,
        fileSnapshot: true,
        snapshotKeys,
        hasPackageJson: Object.prototype.hasOwnProperty.call(JSON.parse(data.fileSnapshot), 'package.json'),
        fileStoreKeys,
      };
    }, projectId);

    lastProbe = probe;

    if (typeof probe === 'object' && probe !== null && (probe as any).hasPackageJson === true) {
      return;
    }

    await page.waitForTimeout(2000);
  }

  throw new Error(
    `timeout waiting for server fileSnapshot with package.json; last probe: ${JSON.stringify(lastProbe)}`,
  );
}

/*
 * Auto-persist attaches the file snapshot on a stream-shape-dependent cadence;
 * the header save button forces a snapshot-only PUT (collectFileSnapshot(true))
 * so the replay has a deterministic package.json to key its restore off.
 */
async function saveProjectFiles(page: Page, chatUrl: string, timeoutMs: number): Promise<void> {
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await waitForFileSnapshot(page, chatUrl, timeoutMs);
}

/** Wipes IndexedDB metadata + OPFS blobs (connections are per-operation, so deleteDatabase is not blocked). */
async function clearCache(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('a2-nm-cache');

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });

    const root = await navigator.storage.getDirectory();

    await root.removeEntry('a2-nm-cache', { recursive: true }).catch(() => undefined);
  });
}

const installDone = (rounds: Rounds) =>
  Object.values(rounds).find((round) =>
    round.actions.some(
      (action) => action.commandClass === 'install' && action.status === 'complete' && action.exitCode === 0,
    ),
  );

const replayBootstrap = (rounds: Rounds) => {
  const replayed = Object.values(rounds).filter((round) => round.source === 'replay');

  if (replayed.length === 0) {
    return undefined;
  }

  // bootstrap = earliest replay round (messageIds are random, startedAt is order-truth)
  const bootstrap = replayed.reduce((first, round) => (round.startedAt < first.startedAt ? round : first));

  return bootstrap.status === 'finalized' ? bootstrap : undefined;
};

/*
 * Preview evidence for replay stages. The previews-store atom is only
 * reachable through the same module instance the app loaded (dynamic imports
 * can resolve a second instance after a reload), so replay assertions key off
 * the telemetry pairing instead — the round's preview.openedAt is set by the
 * same port listener that feeds the previews store.
 */
function expectPreviewPaired(round: Rounds[string], label: string) {
  expect(round.preview.openedAt, label).toBeDefined();
}

/** Waits until the dev server port registers in the previews store. */
async function waitForPreview(page: Page, label: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const previews = await dumpPreviews(page).catch(() => []);

    if (previews.length > 0) {
      return;
    }

    await page.waitForTimeout(2000);
  }

  throw new Error(`timeout waiting for ${label}`);
}

test.describe('快照缓存 (WB-15/WB-16)', () => {
  test('写回、命中回放跳过 install、清缓存后冷回放重新写回', async ({ page }) => {
    test.setTimeout(6 * 60_000);

    await registerUser(page);
    await mountNmStub(page);
    await page.goto('/');

    const prompt = page.getByPlaceholder('How can A2 help you today?');

    await prompt.fill('生成快照缓存 e2e 项目');
    await prompt.press('Enter');

    // Stage 1: fresh generation — install completes and the dev server port opens.
    await pollRounds(page, installDone, 'fresh install completion', 180_000);
    await waitForPreview(page, 'preview port after generation', 120_000);

    // Stage 2: write-back lands in OPFS + IndexedDB.
    const cacheAfterGeneration = await pollCache(page, 'snapshot write-back', 120_000);

    expect(cacheAfterGeneration.entries.length).toBeGreaterThanOrEqual(1);
    expect(cacheAfterGeneration.files.some((file) => file.name.endsWith('.snapshot'))).toBe(true);

    const chatUrl = page.url();

    expect(chatUrl).toMatch(/\/chat\//);

    // Stage 3: reload -> replay hits the cache and skips the bootstrap install.
    await saveProjectFiles(page, chatUrl, 30_000);
    await page.goto(chatUrl);

    const hitBootstrap = await pollRounds(page, replayBootstrap, 'cache-hit replay finalize', 180_000);

    expect(hitBootstrap.restore?.hit).toBe(true);
    expect(hitBootstrap.actions.some((action) => action.commandClass === 'install')).toBe(false);
    expectPreviewPaired(hitBootstrap, 'preview pairing after cache-hit replay');

    // Stage 4: wipe the cache -> replay misses, re-installs, writes back again.
    await clearCache(page);
    await page.goto(chatUrl);

    const coldBootstrap = await pollRounds(page, replayBootstrap, 'cold replay finalize', 240_000);

    expect(coldBootstrap.restore).toMatchObject({ hit: false, fallback: 'none' });

    const coldInstall = coldBootstrap.actions.find((action) => action.commandClass === 'install');

    expect(coldInstall?.status).toBe('complete');
    expect(coldInstall?.exitCode).toBe(0);
    expectPreviewPaired(coldBootstrap, 'preview pairing after cold replay');

    await pollCache(page, 'write-back after cold replay', 120_000);
  });

  test('开关关闭时零差异：不写回、不还原、完整重放', async ({ page }) => {
    test.setTimeout(5 * 60_000);

    // Design D8 emergency override: disable before any app code runs.
    await page.addInitScript(() => window.localStorage.setItem('a2-nm-snapshot-cache', 'off'));

    await registerUser(page);
    await mountNmStub(page);
    await page.goto('/');

    const prompt = page.getByPlaceholder('How can A2 help you today?');

    await prompt.fill('生成快照缓存关闭态 e2e 项目');
    await prompt.press('Enter');

    await pollRounds(page, installDone, 'fresh install completion (flag off)', 180_000);
    await waitForPreview(page, 'preview port (flag off)', 120_000);

    // Give any (unexpected) write-back a chance to land; it must not.
    await page.waitForTimeout(15_000);

    const cache = await dumpCache(page);

    expect(cache.entries).toHaveLength(0);
    expect(cache.files).toHaveLength(0);

    const chatUrl = page.url();

    expect(chatUrl).toMatch(/\/chat\//);

    // Replay runs the full path: install present, no restore record.
    await saveProjectFiles(page, chatUrl, 30_000);
    await page.goto(chatUrl);

    const bootstrap = await pollRounds(page, replayBootstrap, 'flag-off replay finalize', 240_000);

    expect(bootstrap.restore?.hit ?? false).toBe(false);

    const install = bootstrap.actions.find((action) => action.commandClass === 'install');

    expect(install?.status).toBe('complete');
    expect(install?.exitCode).toBe(0);
    expectPreviewPaired(bootstrap, 'preview pairing after flag-off replay');

    // …and still nothing in the cache afterwards.
    await page.waitForTimeout(10_000);

    const cacheAfterReplay = await dumpCache(page);

    expect(cacheAfterReplay.entries).toHaveLength(0);
  });
});
