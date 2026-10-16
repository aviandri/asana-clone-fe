import { ADMIN, expect, loginViaUi, test } from '../fixtures';

// These tests exercise the login form itself, so start logged out.
test.use({ storageState: { cookies: [], origins: [] } });

test('rejects a wrong password', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ADMIN.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
  await expect(page).toHaveURL(/\/login/);
});

test('logs in, survives a reload, and logs out', async ({ page }) => {
  await loginViaUi(page);
  await expect(page).toHaveURL(/\/$/);

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/my-tasks');
  await expect(page).toHaveURL(/\/login/);
});
