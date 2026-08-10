import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

/*
 * A2 test-suite (TS-02/TS-04, design D2): E2E suite for the workbench.
 * The webServer block manages the local workbench instance (pnpm dev on 5173);
 * a developer's already-running dev server is reused outside CI.
 * Override the target with E2E_BASE_URL when testing another instance.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

// Artifacts live in the OS temp dir: writes to the repo dir are blocked for
// the Playwright process on this machine (OS-level EPERM).
const reportRoot = path.join(tmpdir(), 'a2-workbench-e2e');

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  outputDir: path.join(reportRoot, 'artifacts'),
  timeout: 60_000,
  // A single vite dev server compiles on demand; too many workers contend on
  // the cold module graph and time out. Keep parallelism modest.
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(reportRoot, 'report') }]],
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
