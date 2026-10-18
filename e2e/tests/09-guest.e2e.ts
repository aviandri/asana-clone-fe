import { ACME, GUEST, expect, loginViaUi, test } from '../fixtures';

// SPEC §12 guest experience: guest@partner.test is a GUEST in Acme Pilot, on "Pilot Rollout" only.
test.use({ storageState: { cookies: [], origins: [] } });

test('a guest sees only their project and no member-only features', async ({ page }) => {
  await loginViaUi(page, GUEST.email, GUEST.password);
  const nav = page.getByRole('navigation', { name: 'Main' });

  // Guest pill and note.
  await expect(nav.getByRole('button', { name: 'Workspace menu' })).toContainText(ACME);
  await expect(nav.getByText('Guest', { exact: true })).toBeVisible();
  await expect(nav.getByText(`You're a guest in ${ACME}`)).toBeVisible();
  // One workspace → no rail.
  await expect(page.getByRole('navigation', { name: 'Workspaces' })).toHaveCount(0);

  // Hidden: Goals, Teams browse, New project.
  await expect(nav.getByRole('link', { name: 'Goals' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Browse' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /new project/i })).toHaveCount(0);

  // Their one project is listed and opens.
  const projectLinks = nav.getByRole('link', { name: 'Pilot Rollout' });
  await expect(projectLinks).toHaveCount(1);
  await projectLinks.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pilot Rollout' })).toBeVisible();
  // The seed opens Pilot Rollout on its default Board view; check the list too.
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'List' }).click();
  await expect(page.getByRole('table', { name: 'Pilot Rollout tasks' })).toBeVisible();

  // Reporting has no Workload for guests.
  await page.goto('/reporting');
  await expect(page.getByRole('link', { name: 'Workload' })).toHaveCount(0);
});

test('a guest opening Goals by URL gets nothing', async ({ page }) => {
  await loginViaUi(page, GUEST.email, GUEST.password);
  await page.goto('/goals');
  await expect(page.getByRole('treeitem')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New goal' })).toHaveCount(0);
});
