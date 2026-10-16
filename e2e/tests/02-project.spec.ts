import { expect, test, uniq } from '../fixtures';

test('creates a project from the UI', async ({ authedPage: page, api }) => {
  const name = uniq('E2E project');
  await page.goto('/');

  await page.getByRole('button', { name: /new project/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/name/i).fill(name);
  await dialog.getByRole('button', { name: /create/i }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name })).toBeVisible();

  // Server side: default sections were created (SPEC: POST /projects).
  const projectId = page.url().match(/\/projects\/([0-9a-f-]{36})/)![1];
  const project = await api.getProject(projectId);
  expect(project.name).toBe(name);
  expect(project.sections.map((s) => s.name)).toEqual(['To do', 'In progress', 'Done']);
  await api.deleteProject(projectId);
});
