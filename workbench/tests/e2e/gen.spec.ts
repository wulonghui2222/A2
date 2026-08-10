import { expect, test } from '@playwright/test';
import {
  mountLlmStub,
  STUB_ARTIFACT_TITLE,
  STUB_FILE_PATH,
  STUB_INTRO_TEXT,
} from './fixtures/llm-stream';
import { registerUser } from './helpers/auth';

/*
 * A2 test-suite (TS-02, D3/D5): generation flow with a stubbed LLM.
 * Assertions stop at platform behavior: the streamed message appears and the
 * artifact/file action is parsed — no WebContainer build is asserted.
 */

test.describe('生成流 (FR-01/WB-01)', () => {
  test('提交 prompt 后出现流式回复与文件动作', async ({ page }) => {
    await registerUser(page);
    await mountLlmStub(page);

    await page.goto('/');

    const prompt = page.getByPlaceholder('How can A2 help you today?');

    await prompt.fill('做一个最简单的 hello world 页面');
    await prompt.press('Enter');

    // Streamed assistant content reaches the chat.
    await expect(page.getByText(STUB_INTRO_TEXT)).toBeVisible({ timeout: 30_000 });

    // The message parser recognized the artifact and its file action. The
    // title also shows in the header, so target the artifact panel's toggle.
    await expect(page.getByRole('button', { name: new RegExp(STUB_ARTIFACT_TITLE) })).toBeVisible();
    await expect(page.getByText(STUB_FILE_PATH, { exact: true }).first()).toBeVisible();

    // The chat got a URL of its own.
    await expect(page).toHaveURL(/\/chat\//);
  });
});
