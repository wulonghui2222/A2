/**
 * Standalone telemetry sampling script (not part of the e2e suite).
 * Drives real LLM generations against http://localhost:5173 and dumps the
 * generation-telemetry collector state after each round + reload replay.
 * Outputs: %TEMP%\a2-telemetry-sample\*.{json,png}
 * Run from workbench/: node scripts/sample-telemetry.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// pnpm store layout: playwright-core is not hoisted to node_modules/
import { chromium } from '../node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs';

const BASE = 'http://localhost:5173';
const OUT = path.join(os.tmpdir(), 'a2-telemetry-sample');
const ROUND_TIMEOUT_MS = 6 * 60 * 1000;
const POLL_MS = 3000;

fs.mkdirSync(OUT, { recursive: true });

const report = { startedAt: new Date().toISOString(), projects: [], errors: [] };
const save = () => fs.writeFileSync(path.join(OUT, 'sample-report.json'), JSON.stringify(report, null, 2));

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  fs.appendFileSync(path.join(OUT, 'sample.log'), line + '\n');
}

async function dumpRounds(page) {
  try {
    return await page.evaluate(async () => {
      const mod = await import('/app/a2/telemetry.ts');
      return JSON.parse(JSON.stringify(mod.generationTelemetry.rounds.get()));
    });
  } catch (error) {
    log('dumpRounds failed:', String(error));
    return { __error: String(error) };
  }
}

/*
 * replay-snapshot-cache (tasks 2.2/4.2): dump the OPFS snapshot cache state —
 * IndexedDB metadata entries plus the blob files actually on disk.
 */
async function dumpSnapshotCache(page) {
  try {
    return await page.evaluate(async () => {
      const mod = await import('/app/lib/runtime/snapshot-cache.ts');
      const entries = await mod.snapshotCache.entries();
      const files = [];

      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('a2-nm-cache');

        for await (const [name, handle] of dir.entries()) {
          files.push({ name, size: handle.kind === 'file' ? (await handle.getFile()).size : undefined });
        }
      } catch {
        // cache dir missing = no snapshots written yet
      }

      return JSON.parse(JSON.stringify({ entries, files }));
    });
  } catch (error) {
    log('dumpSnapshotCache failed:', String(error));
    return { __error: String(error) };
  }
}

/** Wait until a round satisfies pred; returns collector snapshot. */
async function waitForRound(page, pred, label) {
  const deadline = Date.now() + ROUND_TIMEOUT_MS;
  let last;

  while (Date.now() < deadline) {
    last = await dumpRounds(page);

    const rounds = Object.values(last ?? {});
    const match = rounds.find(pred);

    if (match) {
      log(`[${label}] round satisfied: ${match.messageId} status=${match.status} source=${match.source}`);
      return last;
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  log(`[${label}] TIMEOUT waiting; last snapshot dumped`);

  return last;
}

const freshFinalized = (knownIds) => (round) =>
  round.source === 'fresh' && round.status === 'finalized' && !knownIds.has(round.messageId);
const replayFinalized = () => (round) => round.source === 'replay' && round.status === 'finalized';

/*
 * Bug B1 workaround: fresh rounds with a `start` action recorded before stream
 * end get stuck at 'stream-ended' (drain never completes). Treat a round as
 * settled once the stream ended and either it finalized, the preview opened,
 * or 15s passed since stream end.
 */
const freshSettled = (knownIds) => (round) =>
  round.source === 'fresh' &&
  !knownIds.has(round.messageId) &&
  round.streamEndedAt !== undefined &&
  (round.status === 'finalized' || round.preview?.openedAt !== undefined || Date.now() - round.streamEndedAt > 15_000);

async function dismissAlerts(page) {
  try {
    const btn = page
      .locator('button:has-text("ok"), button:has-text("OK"), button:has-text("知道了"), button:has-text("确定")')
      .first();

    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

async function sendPrompt(page, text, label) {
  const sentAt = Date.now();

  // the fixed telemetry panel overlaps the chat textarea; collapse it first
  const collapse = page.getByRole('button', { name: '收起' });

  if (await collapse.isVisible().catch(() => false)) {
    await collapse.click().catch(() => {});
  }

  // the chat textarea carries a stable placeholder; xterm also renders a helper textarea
  const ta = page.getByPlaceholder('How can A2 help you today?');

  await ta.waitFor({ state: 'visible', timeout: 15_000 });
  await ta.fill(text);

  const value = await ta.inputValue();

  if (value !== text) {
    // controlled component reset the value; force it through the native setter
    await ta.evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;

      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
  }

  // landing-page Enter can be swallowed; prefer the visible submit button
  const sendBtn = page.getByRole('button', { name: '发送' }).last();

  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.click();
  } else {
    await ta.press('Enter');
  }

  // confirm the submit actually went through (URL flips to /chat/ or input clears)
  await page
    .waitForFunction(
      (t) =>
        location.pathname.startsWith('/chat/') ||
        ![...document.querySelectorAll('textarea')].some((el) => el.value === t),
      text,
      { timeout: 15_000 },
    )
    .catch(() => log(`[${label}] WARNING: submit not confirmed`));

  log(`[${label}] prompt sent: ${text}`);

  return sentAt;
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file }).catch((e) => log(`screenshot ${name} failed:`, String(e)));

  return file;
}

async function runProject(context, project) {
  const page = await context.newPage();
  const entry = { name: project.name, rounds: [], replay: undefined };
  let chatUrl;

  report.projects.push(entry);

  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('textarea', { timeout: 30_000 });

    // hydration gate: the landing textarea is inert until ClientOnly mounts
    await page.getByRole('button', { name: '发送' }).first().waitFor({ state: 'visible', timeout: 60_000 });
    page.on('request', (r) => {
      if (r.url().includes('/api/chat')) {
        log(`[net] POST /api/chat started`);
      } else if (r.url().includes('/api/projects')) {
        log(`[net] ${r.method()} ${new URL(r.url()).pathname}`);
      }
    });
    page.on('response', (r) => {
      if (r.url().includes('/api/chat')) {
        log(`[net] /api/chat response status=${r.status()}`);
      } else if (r.url().includes('/api/projects')) {
        log(`[net] ${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`);
      }
    });
    page.on('requestfailed', (r) => {
      if (r.url().includes('/api/')) {
        log(`[net] FAILED ${r.method()} ${new URL(r.url()).pathname} ${r.failure()?.errorText ?? ''}`);
      }
    });

    // replay-snapshot-cache diagnostics: surface browser-side [nm-cache] logs
    page.on('console', (msg) => {
      const text = msg.text();

      if (text.includes('[nm-cache]') || text.includes('SnapshotCache')) {
        log(`[console] ${text}`);
      }
    });
    log(`== project ${project.name}: start ==`);

    const knownIds = new Set();

    for (let i = 0; i < project.prompts.length; i++) {
      const label = `${project.name}#${i + 1}`;
      const sentAt = await sendPrompt(page, project.prompts[i], label);
      const snapshot = await waitForRound(page, freshSettled(knownIds), label);

      for (const round of Object.values(snapshot ?? {})) {
        knownIds.add(round.messageId);
      }

      await dismissAlerts(page);

      const file = await shot(page, `${project.name}-round${i + 1}`);

      entry.rounds.push({ prompt: project.prompts[i], sentAt, screenshot: file, snapshot });
      save();

      // grace window so the final throttled history save (and usage annotation) lands
      await page.waitForTimeout(20_000);

      /*
       * replay-snapshot-cache (task 2.2): the write-back runs shortly after
       * the preview opens; poll until the snapshot lands (or time out).
       */
      if (i === project.prompts.length - 1) {
        const cacheDeadline = Date.now() + 60_000;
        let cache = { entries: [], files: [] };

        while (Date.now() < cacheDeadline) {
          cache = await dumpSnapshotCache(page);

          if ((cache.entries ?? []).length > 0 && (cache.files ?? []).length > 0) {
            break;
          }

          await new Promise((r) => setTimeout(r, 2000));
        }

        entry.cacheAfterGeneration = cache;

        for (const e of cache.entries ?? []) {
          log(`[nm-cache] entry key=${e.key.slice(0, 12)}… size=${(e.sizeBytes / (1024 * 1024)).toFixed(1)}MB`);
        }

        // idempotency: reload-less re-trigger is covered by the replay below
        save();
      }

      if (i === project.prompts.length - 1) {
        chatUrl = page.url();

        if (!chatUrl.includes('/chat/')) {
          await page.waitForURL('**/chat/**', { timeout: 15_000 }).catch(() => {});
          chatUrl = page.url();
        }

        /*
         * The address bar may show the artifact slug while the server still
         * holds its own urlId (or saves never landed at all). Resolve the
         * replay target from the server project list so replay is deterministic.
         */
        const serverProject = await page
          .evaluate(() => fetch('/api/projects').then((r) => (r.ok ? r.json() : null)))
          .catch(() => null);

        if (Array.isArray(serverProject) && serverProject.length > 0) {
          const latest = [...serverProject].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )[0];
          log(`server project: id=${latest.id} urlId=${latest.urlId} desc=${latest.description}`);
          chatUrl = `${BASE}/chat/${latest.id}`;
        } else {
          log(`server project list unavailable; falling back to address bar url ${chatUrl}`);
        }
      }
    }

    // reload -> replay rounds (not persisted; only live collector has them)
    if (!chatUrl || !chatUrl.includes('/chat/')) {
      log(`== project ${project.name}: replay SKIPPED (no chat url, got ${chatUrl}) ==`);
    } else {
      log(`== project ${project.name}: reload replay ${chatUrl} ==`);
      await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });

      const replayedAt = Date.now();

      // wait for at least one finalized replay round, then a grace window for the rest
      await waitForRound(page, replayFinalized(), `${project.name}#replay`);
      await new Promise((r) => setTimeout(r, 15_000));

      const replaySnapshot = await dumpRounds(page);
      const cacheAfterReplay = await dumpSnapshotCache(page);
      const file = await shot(page, `${project.name}-replay`);

      entry.replay = { replayedAt, screenshot: file, snapshot: replaySnapshot, cache: cacheAfterReplay };
      save();

      /*
       * replay-snapshot-cache (task 4.2): report the restore outcome and the
       * cold-vs-cached timing comparison for the bootstrap round.
       */
      const replayRounds = Object.values(replaySnapshot ?? {}).filter((r) => r.source === 'replay');
      const bootstrap = replayRounds[0];

      if (bootstrap) {
        const installAction = bootstrap.actions?.find((a) => a.commandClass === 'install');
        const startAction = bootstrap.actions?.find((a) => a.type === 'start');
        const replayToPreviewMs =
          bootstrap.preview?.openedAt !== undefined ? bootstrap.preview.openedAt - replayedAt : undefined;

        log(
          `[nm-cache] replay bootstrap: restore=${JSON.stringify(bootstrap.restore ?? null)} ` +
            `installAction=${installAction ? `present(${Math.round(installAction.durationMs ?? 0)}ms)` : 'SKIPPED'} ` +
            `startToPreview=${bootstrap.preview?.startToPreviewMs ?? 'n/a'}ms replayToPreview=${replayToPreviewMs ?? 'n/a'}ms`,
        );

        const freshBootstrap = Object.values(entry.rounds[0]?.snapshot ?? {})[0];
        const coldInstall = freshBootstrap?.actions?.find((a) => a.commandClass === 'install');

        if (coldInstall?.durationMs !== undefined) {
          log(`[nm-cache] cold install was ${Math.round(coldInstall.durationMs)}ms`);
        }
      } else {
        log('[nm-cache] replay produced no rounds — restore comparison unavailable');
      }
    }
  } catch (error) {
    log(`project ${project.name} failed:`, String(error));
    report.errors.push({ project: project.name, error: String(error) });
    save();
  } finally {
    await page.close().catch(() => {});
  }
}

async function register(context) {
  const page = await context.newPage();
  const username = `perf${Date.now().toString(36).slice(-6)}`;
  const password = 'perf123456';

  await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
  log(`registered ${username}`);
  await page.close();

  return { username, password };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });

try {
  report.account = await register(context);

  await runProject(context, {
    name: 'todo',
    prompts: [
      '用 Vite + React 做一个非常简单的待办事项 Todo 应用，只需添加任务和标记完成两个功能，样式简洁',
      '把界面上所有文字改成中文，并把背景改成深蓝色',
    ],
  });
} catch (error) {
  log('fatal:', String(error));
  report.errors.push({ error: String(error) });
} finally {
  report.finishedAt = new Date().toISOString();
  save();
  await browser.close();
}

log('done. report at', path.join(OUT, 'sample-report.json'));
