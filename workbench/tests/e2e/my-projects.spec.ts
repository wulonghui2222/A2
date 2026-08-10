import { expect, test } from '@playwright/test';
import { seedProject } from './helpers/api';
import { registerUser } from './helpers/auth';

// A2 test-suite (TS-02): "我的项目" list and chat persistence (WB-06/WB-07).

test.describe('我的项目 (WB-06/WB-07)', () => {
  test('新账号展示空状态', async ({ page }) => {
    await registerUser(page);

    await page.goto('/my-projects');

    await expect(page.getByRole('heading', { name: '我的项目' })).toBeVisible();
    await expect(page.getByText('你还没有任何项目')).toBeVisible();
  });

  test('列表展示项目并可打开聊天页看到历史消息', async ({ page }) => {
    await registerUser(page);
    const project = await seedProject(page.context().request, {
      description: 'E2E 持久化项目',
      messages: [
        { id: 'm1', role: 'user', content: '记录一条测试消息' },
        { id: 'm2', role: 'assistant', content: '收到！' },
      ],
    });

    await page.goto('/my-projects');

    await expect(page.getByText('E2E 持久化项目')).toBeVisible();

    await page.getByRole('link').filter({ hasText: 'E2E 持久化项目' }).click();

    await expect(page).toHaveURL(new RegExp(`/chat/${project.urlId}`));
    await expect(page.getByText('记录一条测试消息')).toBeVisible();
    await expect(page.getByText('收到！')).toBeVisible();
  });
});
