import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';

/*
 * A2 test-suite (TS-03, D4): unique test accounts instead of a separate DB.
 * Every run registers users with random suffixes; created accounts are
 * recorded to a JSONL file so the global teardown can best-effort delete
 * their projects after the suite finishes.
 */

export const TEST_PASSWORD = 'a2-e2e-password';

// Kept outside Playwright's outputDir (which is wiped between runs) and in
// the OS temp dir, since repo-dir writes are blocked for the test process
// on some machines (OS-level EPERM).
export const E2E_ACCOUNTS_FILE = path.join(tmpdir(), 'a2-workbench-e2e', 'e2e-accounts.jsonl');

export function uniqueUsername(): string {
  // Fits the 3-20 char username rule and stays collision-free across runs.
  return `e2e${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 8)}`;
}

export function recordAccount(username: string, password: string): void {
  fs.mkdirSync(path.dirname(E2E_ACCOUNTS_FILE), { recursive: true });
  fs.appendFileSync(E2E_ACCOUNTS_FILE, `${JSON.stringify({ username, password })}\n`);
}

/**
 * Registers through the real UI (UA-01) and waits for the auto-login bounce
 * to the workbench. Returns the credentials for later reuse/teardown.
 */
export async function registerUser(page: Page, username = uniqueUsername(), password = TEST_PASSWORD) {
  await page.goto('/register');
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.waitForURL('**/');

  recordAccount(username, password);

  return { username, password };
}

/**
 * Logs in through the real UI (UA-02). By default navigates to /login first;
 * pass `gotoLogin: false` when the page already sits on the login route (e.g.
 * after a route-guard bounce) so the hidden redirectTo field survives.
 */
export async function loginUser(
  page: Page,
  username: string,
  password: string,
  options: { gotoLogin?: boolean } = {},
) {
  const { gotoLogin = true } = options;

  if (gotoLogin) {
    await page.goto('/login');
  }

  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Header "退出" form posts to /logout (UA-03). */
export async function logoutUser(page: Page) {
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.waitForURL('**/login');
}
