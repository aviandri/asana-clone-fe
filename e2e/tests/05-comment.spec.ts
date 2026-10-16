import { expect, test, uniq } from '../fixtures';

test('opens a task from the list and comments on it', async ({ authedPage: page, api }) => {
  const project = await api.createProject(uniq('E2E comments'));
  const task = await api.createTask({ title: uniq('Discuss me'), projectId: project.id });
  const body = uniq('Looks good to me');

  await page.goto(`/projects/${project.id}/list`);
  // Single click opens the panel (double-click would start renaming).
  await page
    .getByRole('table', { name: `${project.name} tasks` })
    .getByRole('button', { name: task.title, exact: true })
    .click();
  // Once open, the title also appears in the panel, so scope everything to the dialog.
  const panel = page.getByRole('dialog', { name: task.title });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[?&]task=${task.id}`));

  // The Comment button appears once the box is focused (fill focuses it).
  await panel.getByRole('textbox', { name: 'Add a comment' }).fill(body);
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();

  await expect(panel.getByText(body)).toBeVisible();
  await expect
    .poll(async () => (await api.stories(task.id)).filter((s) => s.kind === 'comment').map((s) => s.body))
    .toContain(body);

  // The panel is URL-driven: a direct link reopens it with the comment.
  await page.goto(`/projects/${project.id}/list?task=${task.id}`);
  await expect(page.getByRole('dialog', { name: task.title }).getByText(body)).toBeVisible();
  await api.deleteProject(project.id);
});
