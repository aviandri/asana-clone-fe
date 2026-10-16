import { expect, test, uniq } from '../fixtures';

test('adds a task in list view', async ({ authedPage: page, api }) => {
  const project = await api.createProject(uniq('E2E tasks'));
  const title = uniq('Write the smoke test');

  await page.goto(`/projects/${project.id}/list`);
  await page.getByRole('button', { name: /add task/i }).first().click();
  const input = page.getByRole('textbox', { name: /task name/i });
  await input.fill(title);
  await input.press('Enter');

  await expect(page.getByText(title)).toBeVisible();
  await expect
    .poll(async () => (await api.listProjectTasks(project.id)).map((t) => t.title))
    .toContain(title);

  // Persisted, not just optimistic.
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
  await api.deleteProject(project.id);
});
