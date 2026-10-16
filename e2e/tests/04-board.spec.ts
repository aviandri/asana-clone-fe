import { expect, test, uniq } from '../fixtures';

test('moves a task between board columns by drag and drop', async ({ authedPage: page, api }) => {
  const project = await api.createProject(uniq('E2E board'));
  const todo = project.sections.find((s) => s.name === 'To do')!;
  const doing = project.sections.find((s) => s.name === 'In progress')!;
  const task = await api.createTask({ title: uniq('Drag me'), projectId: project.id, sectionId: todo.id });

  await page.goto(`/projects/${project.id}/board`);
  const todoCol = page.getByRole('region', { name: 'To do' });
  const doingCol = page.getByRole('region', { name: 'In progress' });
  const card = todoCol.getByText(task.title);
  await expect(card).toBeVisible();

  // dnd-kit's PointerSensor needs real, stepped pointer moves (Playwright's dragTo jumps,
  // which doesn't pass an activation distance constraint).
  const from = (await card.boundingBox())!;
  const to = (await doingCol.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 20 });
  await page.mouse.up();

  await expect(doingCol.getByText(task.title)).toBeVisible();
  await expect(todoCol.getByText(task.title)).toHaveCount(0);
  await expect.poll(async () => (await api.getTask(task.id)).sectionId).toBe(doing.id);

  await page.reload();
  await expect(page.getByRole('region', { name: 'In progress' }).getByText(task.title)).toBeVisible();
  await api.deleteProject(project.id);
});
