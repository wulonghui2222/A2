import { expect, test } from '@playwright/test';
import { seedProject } from './helpers/api';
import { loginUser, registerUser } from './helpers/auth';

// A2 test-suite (TS-02): UA-04 route guard with redirectTo round-trip.

test.describe('路由保护 (UA-04)', () => {
  test('未登录访问 chat.$id 跳转登录页，登录后带回跳', async ({ page, browser }) => {
    const account = await registerUser(page);
    const project = await seedProject(page.context().request, {
      description: '守卫测试项目',
      messages: [
        { id: 'm1', role: 'user', content: '你好，守卫测试' },
        { id: 'm2', role: 'assistant', content: '你好！' },
      ],
    });

    // Fresh anonymous context: no session cookie yet.
    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();

    await anonymousPage.goto(`/chat/${project.urlId}`);

    await expect(anonymousPage).toHaveURL(/\/login\?redirectTo=/);

    // Submit the form already on the page so the hidden redirectTo survives.
    await loginUser(anonymousPage, account.username, account.password, { gotoLogin: false });

    await expect(anonymousPage).toHaveURL(new RegExp(`/chat/${project.urlId}`));
    await expect(anonymousPage.getByText('你好，守卫测试')).toBeVisible();

    await anonymous.close();
  });
});
