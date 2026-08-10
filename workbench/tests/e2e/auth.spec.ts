import { expect, test } from '@playwright/test';
import { loginUser, logoutUser, registerUser, TEST_PASSWORD, uniqueUsername } from './helpers/auth';

// A2 test-suite (TS-02): authentication flows through the real UI.

test.describe('认证流 (UA-01/UA-02/UA-03)', () => {
  test('注册新用户并自动登录 (UA-01)', async ({ page }) => {
    const username = uniqueUsername();

    await registerUser(page, username);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
  });

  test('重复用户名被拒绝 (UA-01)', async ({ page }) => {
    const username = uniqueUsername();

    await registerUser(page, username);
    await logoutUser(page);

    await page.goto('/register');
    await page.getByLabel('用户名', { exact: true }).fill(username);
    await page.getByLabel('密码', { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '注册', exact: true }).click();

    await expect(page.getByText('用户名已被注册')).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test('登录与登出往返 (UA-02/UA-03)', async ({ page }) => {
    const { username, password } = await registerUser(page);

    await logoutUser(page);
    await expect(page).toHaveURL(/\/login$/);

    await loginUser(page, username, password, { gotoLogin: false });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
  });

  test('错误密码给出统一错误提示 (UA-02)', async ({ page }) => {
    const { username } = await registerUser(page);

    await logoutUser(page);

    await page.getByLabel('用户名', { exact: true }).fill(username);
    await page.getByLabel('密码', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();

    await expect(page.getByText('用户名或密码错误')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
