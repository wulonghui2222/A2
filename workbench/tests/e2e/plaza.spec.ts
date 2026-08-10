import { expect, test } from '@playwright/test';
import { seedProject } from './helpers/api';
import { registerUser } from './helpers/auth';

// A2 test-suite (TS-02): plaza listing, read-only visitor view (PL-01/PL-02)
// and the visibility toggle round-trip (WB-10).

test.describe('广场流 (PL-01/PL-02/WB-10)', () => {
  test('广场对匿名访客可读', async ({ browser }) => {
    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();

    await anonymousPage.goto('/plaza');

    await expect(anonymousPage.getByRole('heading', { name: '项目广场' })).toBeVisible();

    await anonymous.close();
  });

  test('公开后出现在广场并可只读体验，取消公开后消失', async ({ page }) => {
    await registerUser(page);

    const description = `E2E 广场项目 ${Date.now().toString(36)}`;
    const project = await seedProject(page.context().request, {
      description,
      messages: [{ id: 'm1', role: 'user', content: '你好' }],
      fileSnapshot: { 'index.html': '<h1>plaza</h1>' },
    });

    // WB-10: publish from "我的项目".
    await page.goto('/my-projects');
    await page.getByRole('button', { name: '公开到广场' }).click();
    await expect(page.getByText('已公开')).toBeVisible();

    // PL-01: the project shows up in the plaza listing.
    await page.goto('/plaza');
    await expect(page.getByText(description)).toBeVisible();

    // PL-02: read-only visitor view.
    await page.getByRole('link').filter({ hasText: description }).click();
    await expect(page).toHaveURL(new RegExp(`/plaza/${project.urlId}`));
    await expect(page.getByText(description).first()).toBeVisible();
    await expect(page.getByText('次浏览').first()).toBeVisible();

    // Unpublish again; the plaza listing drops the project.
    await page.goto('/my-projects');
    await page.getByRole('button', { name: '取消公开' }).click();
    await expect(page.getByText('已公开')).toHaveCount(0);

    await page.goto('/plaza');
    await expect(page.getByText(description)).toHaveCount(0);
  });
});
