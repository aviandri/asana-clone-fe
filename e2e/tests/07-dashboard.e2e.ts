import { readFile } from 'node:fs/promises';
import { expect, isoDate, test, uniq } from '../fixtures';

test('opens the project Dashboard tab and exports CSV', async ({ authedPage: page, api }) => {
  const project = await api.createProject(uniq('E2E dashboard'));
  try {
    // 3 tasks: one completed, one overdue, one open with no due date.
    const done = await api.createTask({ title: uniq('Done task'), projectId: project.id });
    await api.updateTask(done.id, { completed: true });
    await api.createTask({ title: uniq('Late task'), projectId: project.id, dueDate: isoDate(-3) });
    await api.createTask({ title: uniq('Open task'), projectId: project.id });

    await page.goto(`/projects/${project.id}/list`);
    await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/dashboard`));

    // KPI tiles: role="group" named by label, value as text.
    await expect(page.getByRole('group', { name: 'Total tasks', exact: true })).toContainText('3');
    await expect(page.getByRole('group', { name: 'Completed', exact: true })).toContainText('1');
    await expect(page.getByRole('group', { name: 'Overdue', exact: true })).toContainText('1');

    // Export: a real file download with the SPEC §11 header row.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      // Either an <a download> or a button that fetches and saves.
      page.getByRole('link', { name: 'Export CSV' }).or(page.getByRole('button', { name: 'Export CSV' })).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/-tasks\.csv$/);
    const csv = await readFile((await download.path())!, 'utf8');
    // BE sends a UTF-8 BOM and CRLF line endings.
    const header = csv.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
    expect(header).toBe(
      'id,title,section,parent_task_id,assignee_name,assignee_email,priority,start_date,due_date,completed,completed_at,created_at',
    );
  } finally {
    await api.deleteProject(project.id);
  }
});
