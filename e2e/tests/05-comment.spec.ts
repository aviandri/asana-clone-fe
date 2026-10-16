import { expect, test, uniq } from '../fixtures';

test('comments on a task from the detail panel', async ({ authedPage: page, api }) => {
  const project = await api.createProject(uniq('E2E comments'));
  const task = await api.createTask({ title: uniq('Discuss me'), projectId: project.id });
  const body = uniq('Looks good to me');

  await page.goto(`/projects/${project.id}/list`);
  await page.getByText(task.title).click();
  const panel = page.getByRole('dialog', { name: task.title });
  await expect(panel).toBeVisible();

  await panel.getByRole('textbox', { name: /comment/i }).fill(body);
  await panel.getByRole('button', { name: /^comment$/i }).click();

  await expect(panel.getByText(body)).toBeVisible();
  await expect
    .poll(async () => (await api.stories(task.id)).filter((s) => s.kind === 'comment').map((s) => s.body))
    .toContain(body);
  await api.deleteProject(project.id);
});
