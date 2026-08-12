import type { WebContainer } from '@webcontainer/api';
import { A2_ENABLE_NM_SNAPSHOT_CACHE } from '~/a2/config';
import { generationTelemetry } from '~/a2/telemetry';
import { createScopedLogger } from '~/utils/logger';

/*
 * The workbench singleton is imported LAZILY: statically importing
 * '~/lib/webcontainer' boots a WebContainer at module evaluation, which
 * would consume the single per-document boot slot and break the plaza's
 * own instance. Only the workbench-side restore/write-back paths need it;
 * the plaza variants receive their instance explicitly.
 */
async function getWorkbenchWebContainer(): Promise<WebContainer> {
  const { webcontainer } = await import('~/lib/webcontainer');
  return webcontainer;
}

/*
 * replay-snapshot-cache (design D1-D6): browser-side cache of serialized
 * WebContainer workspaces. After a round installs dependencies and opens the
 * preview, the whole tree is serialized (JSON — the only format that can
 * round-trip on the pinned internal runtime build) into OPFS keyed by the
 * sha256 of package.json. On replay the snapshot is mounted back, skipping
 * npm install (~12.5s of the ~17s replay).
 *
 * POC constraints baked in (branch poc/nm-snapshot-cache):
 * - only `json` round-trips (zip: rawindex EIO; msgpack: EINVAL)
 * - mountPoint mounts never land on the FS; the ROOT snapshot must be
 *   mounted without a mountPoint
 * - exec bits are lost; `chmod 755 node_modules/.bin/*` repairs the shims
 */

const logger = createScopedLogger('SnapshotCache');

const DB_NAME = 'a2-nm-cache';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
const OPFS_DIR = 'a2-nm-cache';
const SNAPSHOT_SUFFIX = '.snapshot';

/** Design D6: per-snapshot cap and LRU budget. */
export const MAX_SNAPSHOT_BYTES = 150 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** Design D8: localStorage emergency override ("off" disables without a deploy). */
const LOCAL_STORAGE_OVERRIDE_KEY = 'a2-nm-snapshot-cache';

export interface SnapshotCacheEntry {
  key: string;
  sizeBytes: number;
  createdAt: number;
  lastUsedAt: number;
}

export interface SnapshotRestoreResult {
  restored: boolean;
  durationMs: number;
  fallback: 'none' | 'mount-failed';
}

export function isNmSnapshotCacheEnabled(): boolean {
  if (import.meta.env.SSR || typeof window === 'undefined') {
    return false;
  }

  const override = window.localStorage.getItem(LOCAL_STORAGE_OVERRIDE_KEY);

  if (override === 'off' || override === 'false') {
    return false;
  }

  if (override === 'on' || override === 'true') {
    return true;
  }

  return A2_ENABLE_NM_SNAPSHOT_CACHE;
}

/** Design D3: cache key — sha256 of the package.json content. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Design D6: evict least-recently-used entries until within budget. Pure. */
export function planEviction(entries: SnapshotCacheEntry[], totalBytes: number, limitBytes: number): string[] {
  if (totalBytes <= limitBytes) {
    return [];
  }

  const ordered = [...entries].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const toEvict: string[] = [];
  let remaining = totalBytes;

  for (const entry of ordered) {
    if (remaining <= limitBytes) {
      break;
    }

    toEvict.push(entry.key);
    remaining -= entry.sizeBytes;
  }

  return toEvict;
}

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openMetaDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = fn(tx.objectStore(STORE_NAME));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

async function listEntries(): Promise<SnapshotCacheEntry[]> {
  return withStore<SnapshotCacheEntry[]>('readonly', (store) => store.getAll() as IDBRequest<SnapshotCacheEntry[]>);
}

function getEntry(key: string): Promise<SnapshotCacheEntry | undefined> {
  return withStore<SnapshotCacheEntry | undefined>('readonly', (store) => store.get(key));
}

function putEntry(entry: SnapshotCacheEntry): Promise<void> {
  return withStore('readwrite', (store) => store.put(entry)).then(() => undefined);
}

function deleteEntry(key: string): Promise<void> {
  return withStore('readwrite', (store) => store.delete(key)).then(() => undefined);
}

async function getOpfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

async function readSnapshotBlob(key: string): Promise<Uint8Array | undefined> {
  try {
    const dir = await getOpfsDir();
    const handle = await dir.getFileHandle(`${key}${SNAPSHOT_SUFFIX}`);
    const file = await handle.getFile();

    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return undefined;
  }
}

async function writeSnapshotBlob(key: string, bytes: Uint8Array): Promise<void> {
  const dir = await getOpfsDir();
  const handle = await dir.getFileHandle(`${key}${SNAPSHOT_SUFFIX}`, { create: true });
  const writable = await handle.createWritable();

  // slice() copies into a plain ArrayBuffer-backed view (TS ArrayBufferView<ArrayBuffer>)
  await writable.write(new Blob([bytes.slice()]));
  await writable.close();
}

async function removeSnapshotBlob(key: string): Promise<void> {
  try {
    const dir = await getOpfsDir();
    await dir.removeEntry(`${key}${SNAPSHOT_SUFFIX}`);
  } catch {
    // missing blob is fine — metadata is the source of truth
  }
}

async function evictIfNeeded(): Promise<void> {
  const entries = await listEntries();
  const total = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const victims = planEviction(entries, total, MAX_TOTAL_BYTES);

  for (const key of victims) {
    await deleteEntry(key);
    await removeSnapshotBlob(key);
    logger.debug(`evicted snapshot ${key.slice(0, 12)}…`);
  }
}

export const snapshotCache = {
  /** Design D3: hash-lookup without touching lastUsedAt (restore probe). */
  async lookup(packageJsonContent: string): Promise<SnapshotCacheEntry | undefined> {
    if (!isNmSnapshotCacheEnabled()) {
      return undefined;
    }

    try {
      return await getEntry(await sha256Hex(packageJsonContent));
    } catch (error) {
      logger.warn('snapshot cache lookup failed', error);
      return undefined;
    }
  },

  /** Design D1/D6: store a snapshot blob with size caps and LRU eviction. */
  async put(packageJsonContent: string, bytes: Uint8Array): Promise<boolean> {
    if (!isNmSnapshotCacheEnabled()) {
      return false;
    }

    if (bytes.byteLength > MAX_SNAPSHOT_BYTES) {
      logger.debug(`snapshot too large (${bytes.byteLength} bytes), skipping cache`);
      return false;
    }

    try {
      const key = await sha256Hex(packageJsonContent);

      if (await getEntry(key)) {
        return true; // idempotent: content-addressed, nothing to update
      }

      const now = Date.now();

      await writeSnapshotBlob(key, bytes);
      await putEntry({ key, sizeBytes: bytes.byteLength, createdAt: now, lastUsedAt: now });
      await evictIfNeeded();

      logger.debug(`cached snapshot ${key.slice(0, 12)}… (${bytes.byteLength} bytes)`);

      return true;
    } catch (error) {
      // QuotaExceeded and friends: give up silently (design D6)
      logger.warn('snapshot cache put failed', error);
      return false;
    }
  },

  /** Mark a cache hit as recently used (bumps LRU position). */
  async touch(key: string): Promise<void> {
    try {
      const entry = await getEntry(key);

      if (entry) {
        await putEntry({ ...entry, lastUsedAt: Date.now() });
      }
    } catch {
      // best-effort
    }
  },

  async entries(): Promise<SnapshotCacheEntry[]> {
    try {
      return await listEntries();
    } catch {
      return [];
    }
  },
};

/*
 * Restore side (design D5). State survives HMR like the bolt stores do.
 */
interface RestoreState {
  used: boolean;
  bootstrapMessageId?: string;
  skippedInstallCommand?: string;
  recovered: boolean;
}

const restoreState: RestoreState = import.meta.hot?.data.snapshotRestoreState ?? {
  used: false,
  recovered: false,
};

if (import.meta.hot) {
  import.meta.hot.data.snapshotRestoreState = restoreState;
}

type InternalSerialize = (folder: string, options?: { format?: string }) => Promise<Uint8Array>;

function getSerialize(wc: WebContainer): InternalSerialize | undefined {
  const internal = (wc as unknown as { internal?: { serialize?: InternalSerialize } }).internal;

  if (!internal?.serialize) {
    return undefined;
  }

  // keep the receiver bound: serialize is a method on wc.internal
  return (folder, options) => internal.serialize!(folder, options);
}

function setSnapshotRestoreInfo(info: SnapshotRestoreResult) {
  if (import.meta.hot) {
    import.meta.hot.data.snapshotRestoreInfo = info;
  }
}

/**
 * Design D5 steps 1-4: mount the cached root snapshot over the fresh boot,
 * repair exec bits, health-check. Returns whether the replay may skip the
 * bootstrap file/install actions. Never throws.
 */
async function tryRestoreSnapshot(packageJsonContent: string): Promise<SnapshotRestoreResult> {
  const startedAt = Date.now();

  const miss = (fallback: SnapshotRestoreResult['fallback'] = 'none'): SnapshotRestoreResult => ({
    restored: false,
    durationMs: Date.now() - startedAt,
    fallback,
  });

  if (!isNmSnapshotCacheEnabled() || !packageJsonContent) {
    return miss();
  }

  try {
    const key = await sha256Hex(packageJsonContent);
    const entry = await getEntry(key);

    if (!entry) {
      return miss();
    }

    const bytes = await readSnapshotBlob(key);

    if (!bytes) {
      // metadata without blob (partial eviction): clean up and miss
      await deleteEntry(key);
      return miss();
    }

    const wc = await getWorkbenchWebContainer();

    await wc.mount(bytes);

    // exec bits do not survive the json round-trip (POC finding)
    const chmod = await wc.spawn('jsh', ['-c', 'chmod 755 node_modules/.bin/*']);
    await chmod.exit;
    void chmod.output.pipeTo(new WritableStream()).catch(() => undefined);

    // health check: .bin populated and package.json readable
    const binEntries = await wc.fs.readdir('node_modules/.bin').catch(() => undefined);
    const packageJson = await wc.fs.readFile('package.json', 'utf-8').catch(() => undefined);

    if (!binEntries || binEntries.length === 0 || packageJson === undefined) {
      return miss('mount-failed');
    }

    await snapshotCache.touch(key);

    return { restored: true, durationMs: Date.now() - startedAt, fallback: 'none' };
  } catch (error) {
    logger.warn('snapshot restore failed, falling back to full replay', error);
    return miss('mount-failed');
  }
}

/**
 * Replay entry point (called from useChatHistory): attempt the restore and
 * stash the outcome for the bootstrap round's telemetry tap.
 */
export async function restoreWorkspaceSnapshot(
  packageJsonContent: string | undefined,
  bootstrapMessageId: string,
): Promise<SnapshotRestoreResult> {
  const info = await tryRestoreSnapshot(packageJsonContent ?? '');

  setSnapshotRestoreInfo(info);
  generationTelemetry.recordRestore({ hit: info.restored, durationMs: info.durationMs, fallback: info.fallback });

  if (info.restored) {
    restoreState.used = true;
    restoreState.recovered = false;
    restoreState.bootstrapMessageId = bootstrapMessageId;
    restoreState.skippedInstallCommand = undefined;
    logger.info(`replay restored from snapshot in ${info.durationMs}ms`);
  }

  return info;
}

export function getRestoredBootstrapMessageId(): string | undefined {
  return restoreState.used ? restoreState.bootstrapMessageId : undefined;
}

export function isRestoredActionSkippable(messageId: string, actionType: string, command?: string): boolean {
  if (!restoreState.used || messageId !== restoreState.bootstrapMessageId) {
    return false;
  }

  if (actionType === 'file') {
    return true;
  }

  if (actionType === 'shell' && command && /^(npm|pnpm|yarn)\s+(install|i\b|add)\b/.test(command.trim())) {
    // remember for the start-failure recovery path (design D5 step 6)
    restoreState.skippedInstallCommand = command;
    return true;
  }

  return false;
}

/**
 * Design D5 step 6: the restored dev server may fail to start; recover by
 * running the skipped install and letting the caller retry the start command.
 * Returns whether the caller should retry.
 */
export async function prepareStartRecovery(executeCommand: (command: string) => Promise<number | undefined>) {
  if (!restoreState.used || restoreState.recovered || !restoreState.skippedInstallCommand) {
    return { retry: false as const };
  }

  restoreState.recovered = true;

  try {
    logger.info('restored start failed — running the skipped install before retry');

    const exitCode = await executeCommand(restoreState.skippedInstallCommand);

    return { retry: exitCode === 0 };
  } catch (error) {
    logger.warn('snapshot start recovery install failed', error);
    return { retry: false as const };
  }
}

/*
 * Write-back side (design D4): once a successful install (any round) has
 * paired with an open preview (any round), serialize the workspace and cache
 * it. The two pieces of evidence land on different rounds in practice
 * (install on the bootstrap round, preview.openedAt on the round the user
 * clicked), so the condition aggregates over the whole rounds map. Driven by
 * the telemetry rounds store so no bolt file needs a write-back tap.
 */
let writeBackSubscribed = false;
const inFlightWriteBacks = new Set<string>();

/*
 * The telemetry preview.openedAt pairing can miss finalized rounds (B1-style
 * early finalization), so the raw port-open event is tracked independently as
 * equally valid "preview is up" evidence.
 */
let previewPortOpen = false;

type WriteBackRound = {
  actions: Array<{ commandClass?: string; status: string; exitCode?: number }>;
  preview: { openedAt?: number };
};

async function maybeWriteBack(rounds: Record<string, WriteBackRound>) {
  const allRounds = Object.values(rounds);
  const installSucceeded = allRounds.some((round) =>
    round.actions.some(
      (action) => action.commandClass === 'install' && action.status === 'complete' && action.exitCode === 0,
    ),
  );
  const previewOpened = previewPortOpen || allRounds.some((round) => round.preview.openedAt !== undefined);

  if (!installSucceeded || !previewOpened) {
    return;
  }

  if (!isNmSnapshotCacheEnabled()) {
    return;
  }

  logger.info('[nm-cache] write-back triggered (install ok + preview open)');

  try {
    const wc = await getWorkbenchWebContainer();
    const packageJsonContent = await wc.fs.readFile('package.json', 'utf-8').catch(() => undefined);

    if (!packageJsonContent) {
      logger.warn('[nm-cache] write-back aborted: package.json unreadable');
      return;
    }

    const key = await sha256Hex(packageJsonContent);

    if (inFlightWriteBacks.has(key) || (await getEntry(key))) {
      return; // idempotent (design D4)
    }

    const serialize = getSerialize(wc);

    if (!serialize) {
      logger.warn('wc.internal.serialize unavailable — snapshot write-back disabled');
      return;
    }

    inFlightWriteBacks.add(key);

    try {
      logger.info('[nm-cache] serializing workspace (json)…');

      const bytes = await serialize('.', { format: 'json' });

      logger.info(`[nm-cache] serialized ${(bytes.byteLength / (1024 * 1024)).toFixed(1)}MB, writing to OPFS…`);

      const stored = await snapshotCache.put(packageJsonContent, bytes);

      logger.info(`[nm-cache] put result=${stored} key=${key.slice(0, 12)}…`);
    } finally {
      inFlightWriteBacks.delete(key);
    }
  } catch (error) {
    logger.warn('snapshot write-back failed', error);
  }
}

export function ensureWriteBackSubscription() {
  if (writeBackSubscribed || import.meta.env.SSR) {
    return;
  }

  writeBackSubscribed = true;

  generationTelemetry.rounds.subscribe((rounds) => {
    void maybeWriteBack(rounds as Record<string, WriteBackRound>);
  });

  /*
   * The rounds store can go quiet once everything finalizes: if the preview
   * port opens afterwards (no active/draining round to tap), no rounds update
   * fires. Tap the port event directly so the write-back still triggers.
   */
  void getWorkbenchWebContainer()
    .then((wc) => {
      wc.on('port', (_port, type) => {
        if (type === 'open') {
          previewPortOpen = true;
          void maybeWriteBack(generationTelemetry.rounds.get() as Record<string, WriteBackRound>);
        } else if (type === 'close') {
          previewPortOpen = false;
        }
      });
    })
    .catch(() => undefined);
}

/** Test/diagnostic hook used by verification scripts. */
export function __snapshotCacheInternals() {
  return { restoreState, getEntry, readSnapshotBlob, listEntries };
}

/*
 * Plaza visitor variants: the plaza boots its own WebContainer (not the
 * workbench singleton), so restore/write-back take an explicit instance.
 * The cache itself is shared with the workbench (same package.json-hash
 * key), so a workspace cached during generation also speeds up plaza visits.
 */

/**
 * Plaza restore: mount the cached workspace snapshot into the given
 * WebContainer instance, skipping a cold npm install. Returns whether the
 * caller may skip the install. Never throws; any failure reports a miss.
 */
export async function restorePlazaSnapshot(
  wc: WebContainer,
  packageJsonContent: string,
): Promise<SnapshotRestoreResult> {
  const startedAt = Date.now();

  const miss = (fallback: SnapshotRestoreResult['fallback'] = 'none'): SnapshotRestoreResult => ({
    restored: false,
    durationMs: Date.now() - startedAt,
    fallback,
  });

  if (!isNmSnapshotCacheEnabled() || !packageJsonContent) {
    return miss();
  }

  try {
    const key = await sha256Hex(packageJsonContent);
    const entry = await getEntry(key);

    if (!entry) {
      return miss();
    }

    const bytes = await readSnapshotBlob(key);

    if (!bytes) {
      await deleteEntry(key);
      return miss();
    }

    await wc.mount(bytes);

    // exec bits do not survive the json round-trip (POC finding)
    const chmod = await wc.spawn('jsh', ['-c', 'chmod 755 node_modules/.bin/*']);
    await chmod.exit;
    void chmod.output.pipeTo(new WritableStream()).catch(() => undefined);

    // health check: .bin populated and package.json readable
    const binEntries = await wc.fs.readdir('node_modules/.bin').catch(() => undefined);
    const packageJson = await wc.fs.readFile('package.json', 'utf-8').catch(() => undefined);

    if (!binEntries || binEntries.length === 0 || packageJson === undefined) {
      return miss('mount-failed');
    }

    await snapshotCache.touch(key);
    logger.info(`[nm-cache] plaza restore hit in ${Date.now() - startedAt}ms`);

    return { restored: true, durationMs: Date.now() - startedAt, fallback: 'none' };
  } catch (error) {
    logger.warn('[nm-cache] plaza restore failed, falling back to cold install', error);
    return miss('mount-failed');
  }
}

/**
 * Plaza write-back: after a cold install succeeds and the dev server is up,
 * serialize the workspace into the shared OPFS cache so later visits (plaza
 * or workbench replay) with the same package.json skip the install.
 * Idempotent; never throws.
 */
export async function writeBackPlazaSnapshot(wc: WebContainer, packageJsonContent: string): Promise<void> {
  if (!isNmSnapshotCacheEnabled() || !packageJsonContent) {
    return;
  }

  try {
    const key = await sha256Hex(packageJsonContent);

    if (inFlightWriteBacks.has(key) || (await getEntry(key))) {
      return; // idempotent (design D4)
    }

    const serialize = getSerialize(wc);

    if (!serialize) {
      logger.warn('[nm-cache] wc.internal.serialize unavailable — plaza write-back disabled');
      return;
    }

    inFlightWriteBacks.add(key);

    try {
      const bytes = await serialize('.', { format: 'json' });
      const stored = await snapshotCache.put(packageJsonContent, bytes);

      logger.info(`[nm-cache] plaza write-back ${stored ? 'ok' : 'skipped'} (${bytes.byteLength} bytes)`);
    } finally {
      inFlightWriteBacks.delete(key);
    }
  } catch (error) {
    logger.warn('[nm-cache] plaza write-back failed', error);
  }
}

/*
 * The write-back subscription is kicked from the workbench store module
 * (workbench-only code path). Kicking it here at module evaluation would
 * pull in the workbench WebContainer singleton on the plaza page and steal
 * its single boot slot.
 */
