import { expect, test, uniq } from '../fixtures';

test('adds a task in list view', async ({ authedPage: page, api }) => {
  const project = await api.createProject(uniq('E2E tasks'));
  const title = uniq('Write the smoke test');

  await page.goto(`/projects/${project.id}/list`);
  // Toolbar button; per-section buttons read "Add a task…" / "Add a task to <section>".
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  // Exact name: renaming an existing row shows a separate textbox labelled "Task name".
  const input = page.getByRole('textbox', { name: 'New task name', exact: true });
  await input.fill(title);
  await input.press('Enter');

  const table = page.getByRole('table', { name: `${project.name} tasks` });
  // Exact name: the row's complete toggle is labelled `Mark "<title>" complete`.
  await expect(table.getByRole('button', { name: title, exact: true })).toBeVisible();
  await expect
    .poll(async () => (await api.listProjectTasks(project.id)).map((t) => t.title))
    .toContain(title);

  // Persisted, not just optimistic.
  await page.reload();
  await expect(table.getByRole('button', { name: title, exact: true })).toBeVisible();
  await api.deleteProject(project.id);
});
