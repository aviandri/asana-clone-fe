import { ACME, ALICE, MEKARI, expect, loginViaUi, test } from '../fixtures';

// alice is in two workspaces (SPEC §12 seed), so she gets the switcher menu and the rail.
// Logs in as alice in a fresh context; each test restores her current workspace to Mekari.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await loginViaUi(page, ALICE.email, ALICE.password);
});

test.afterEach(async ({ api }) => {
  await api.switchWorkspace((await api.workspaceByName(MEKARI)).id);
});

test('switches workspace from the sidebar menu', async ({ page, api }) => {
  const nav = page.getByRole('navigation', { name: 'Main' });
  const switcher = nav.getByRole('button', { name: 'Workspace menu' });
  await expect(switcher).toContainText(MEKARI);

  await switcher.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitemradio', { name: MEKARI })).toHaveAttribute('aria-checked', 'true');
  await expect(menu.getByRole('menuitemradio', { name: ACME })).toHaveAttribute('aria-checked', 'false');
  await expect(menu.getByRole('menuitem', { name: 'Create workspace' })).toBeVisible();
  await menu.getByRole('menuitemradio', { name: ACME }).click();

  await expect(page.getByRole('status').filter({ hasText: `Switched to ${ACME}` })).toBeVisible();
  await expect(page).toHaveURL(/\/(my-tasks)?$/);
  await expect(switcher).toContainText(ACME);
  // The sidebar now lists Acme's projects, and the server remembers the choice.
  await expect(nav.getByRole('link', { name: 'Pilot Rollout' })).toBeVisible();
  expect((await api.me()).currentWorkspace?.name).toBe(ACME);

  // The choice survives a reload (per-tab state seeded from localStorage).
  await page.reload();
  await expect(switcher).toContainText(ACME);
});

test('workspace rail and Ctrl/⌘+number shortcuts', async ({ page }) => {
  // Rail tiles follow Me.workspaces order (by name): 1 = Acme Pilot, 2 = Mekari.
  const rail = page.getByRole('navigation', { name: 'Workspaces' });
  await expect(rail.getByRole('button', { name: ACME })).toBeVisible();
  await expect(rail.getByRole('button', { name: MEKARI })).toHaveAttribute('aria-current', 'true');

  const switcher = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Workspace menu' });
  await page.keyboard.press('ControlOrMeta+1');
  await expect(switcher).toContainText(ACME);
  await page.keyboard.press('ControlOrMeta+2');
  await expect(switcher).toContainText(MEKARI);

  await rail.getByRole('button', { name: ACME }).click();
  await expect(switcher).toContainText(ACME);
  await expect(rail.getByRole('button', { name: ACME })).toHaveAttribute('aria-current', 'true');
});

test('a deep link into another workspace switches to it', async ({ page, api }) => {
  const acme = await api.workspaceByName(ACME);
  const pilot = (await api.projectsIn(acme.id)).find((p) => p.name === 'Pilot Rollout');
  expect(pilot, 'seed project "Pilot Rollout" in Acme Pilot').toBeTruthy();
  const [task] = await api.listProjectTasks(pilot!.id); // ID-addressed: works from any workspace
  expect(task, 'Pilot Rollout should have seed tasks').toBeTruthy();

  // Current workspace is Mekari; open an Acme task directly.
  await page.goto(`/projects/${pilot!.id}/list?task=${task.id}`);
  await expect(page.getByRole('status').filter({ hasText: `Switched to ${ACME}` })).toBeVisible();
  await expect(page.getByRole('dialog', { name: task.title })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Workspace menu' })).toContainText(ACME);
});
