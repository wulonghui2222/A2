import { request } from '@playwright/test';
import fs from 'node:fs';
import { E2E_ACCOUNTS_FILE } from './helpers/auth';

/*
 * A2 test-suite (TS-03, D4): best-effort cleanup of this run's test data.
 * For every recorded account, log in via the form action and delete all of
 * its projects through the API. User rows remain (unique names never
 * collide); failures are swallowed so cleanup can never fail the suite.
 */
export default async function globalTeardown() {
  if (!fs.existsSync(E2E_ACCOUNTS_FILE)) {
    return;
  }

  const lines = fs.readFileSync(E2E_ACCOUNTS_FILE, 'utf-8').split('\n').filter(Boolean);
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

  let context;

  try {
    context = await request.newContext({ baseURL });

    for (const line of lines) {
      try {
        const { username, password } = JSON.parse(line) as { username: string; password: string };

        // Form login; the context keeps the resulting session cookie.
        const login = await context.post('/login', {
          form: { username, password, redirectTo: '/' },
        });

        if (!login.ok()) {
          continue;
        }

        const list = await context.get('/api/projects');

        if (!list.ok()) {
          continue;
        }

        const projects = (await list.json()) as { id: string }[];

        for (const project of projects) {
          await context.delete(`/api/projects/${project.id}`);
        }
      } catch {
        // Best-effort: skip broken entries and keep going.
      }
    }
  } catch {
    // Server may already be gone; nothing to do.
  } finally {
    await context?.dispose();
  }

  fs.rmSync(E2E_ACCOUNTS_FILE, { force: true });
}
