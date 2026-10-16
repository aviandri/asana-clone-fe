import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN, BOB, renderApp, setupMockApi } from '@/test/utils';

const user = () => userEvent.setup();

describe('project dashboard (e2e contract)', () => {
  it('is reachable from the Project views nav and shows KPI tiles + CSV export', async () => {
    const db = setupMockApi(ADMIN);
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    const { router } = renderApp(`/projects/${p.id}/list`, { db });
    const views = await screen.findByRole('navigation', { name: 'Project views' });
    await user().click(within(views).getByRole('link', { name: 'Dashboard' }));
    expect(router.state.location.pathname).toBe(`/projects/${p.id}/dashboard`);

    const tasks = db.tasks.filter((t) => t.projectId === p.id);
    const total = await screen.findByRole('group', { name: 'Total tasks' });
    expect(total).toHaveTextContent(String(tasks.length));
    expect(screen.getByRole('group', { name: 'Completed' })).toHaveTextContent(String(tasks.filter((t) => t.completed).length));
    expect(screen.getByRole('group', { name: 'Overdue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', `/api/v1/projects/${p.id}/tasks.csv`);
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('download');
  });

  it('gives every chart a table alternative', async () => {
    const db = setupMockApi(ADMIN);
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    renderApp(`/projects/${p.id}/dashboard`, { db });
    const sections = await screen.findByRole('figure', { name: 'Tasks by section' });
    const table = within(sections).getByRole('table', { name: 'Tasks by section' });
    expect(within(table).getByRole('rowheader', { name: 'To do' })).toBeInTheDocument();
    for (const name of ['Tasks by assignee', 'Incomplete tasks by priority', 'Created vs completed']) {
      const fig = screen.getByRole('figure', { name });
      expect(within(fig).getByRole('table')).toBeInTheDocument();
    }
    const priority = screen.getByRole('table', { name: 'Incomplete tasks by priority' });
    expect(within(priority).getAllByRole('rowheader').map((r) => r.textContent)).toEqual(['High', 'Medium', 'Low', 'None']);

    // Toggle shows the table visibly instead of the chart.
    await user().click(within(sections).getByRole('button', { name: 'Show table' }));
    expect(within(sections).getByRole('button', { name: 'Show chart' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('changes the trend range and lists upcoming tasks that open the task panel', async () => {
    const db = setupMockApi(ADMIN);
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    renderApp(`/projects/${p.id}/dashboard`, { db });
    const u = user();
    await u.selectOptions(await screen.findByRole('combobox', { name: 'Trend range' }), '4');
    const trend = screen.getByRole('table', { name: 'Created vs completed' });
    await waitFor(() => expect(within(trend).getAllByRole('row')).toHaveLength(5)); // header + 4 weeks
    const upcoming = screen.getByRole('list', { name: 'Upcoming tasks' });
    await u.click(within(upcoming).getByRole('button', { name: /Draft new homepage copy/ }));
    expect(await screen.findByRole('dialog', { name: 'Draft new homepage copy' })).toBeInTheDocument();
  });
});

describe('reporting page', () => {
  it('has a sidebar entry and an overview table with a team filter', async () => {
    renderApp('/', { loginAs: ADMIN });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    await user().click(within(nav).getByRole('link', { name: 'Reporting' }));
    const table = await screen.findByRole('table', { name: 'Projects overview' });
    expect(within(table).getByRole('link', { name: /Website Redesign/ })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: /Q4 Launch Campaign/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Projects' })).toHaveTextContent('3');

    await user().selectOptions(screen.getByRole('combobox', { name: 'Team' }), 'Marketing');
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Projects overview' })).queryByRole('link', { name: /Website Redesign/ })).not.toBeInTheDocument());
  });

  it('shows workload with a visibility note for members and validates the range', async () => {
    renderApp('/reporting?tab=workload', { loginAs: BOB });
    expect(await screen.findByText(/only counts tasks you can see/i)).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /^Workload/ });
    expect(within(table).getByRole('columnheader', { name: 'Due this period' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /Bob Brown/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Open tasks per person' })).toBeInTheDocument();

    const u = user();
    await u.click(screen.getByRole('button', { name: 'Next 30 days' }));
    expect(screen.getByRole('button', { name: 'Next 30 days' })).toHaveAttribute('aria-pressed', 'true');
    const to = screen.getByLabelText('To');
    await u.clear(to);
    await u.type(to, '2000-01-01');
    expect(await screen.findByText(/start date on or before the end date/)).toBeInTheDocument();
  });

  it('hides the visibility note for admins', async () => {
    renderApp('/reporting?tab=workload', { loginAs: ADMIN });
    await screen.findByRole('table', { name: /^Workload/ });
    expect(screen.queryByText(/only counts tasks you can see/i)).not.toBeInTheDocument();
  });

  it('summarises goals by status for a period', async () => {
    renderApp('/reporting?tab=goals', { loginAs: ADMIN });
    const list = await screen.findByRole('list', { name: 'Goals by status' });
    expect(within(list).getByText('Off track')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Goals' })).toHaveTextContent(/^Goals6/);
    expect(screen.getByRole('group', { name: 'At risk or off track' })).toHaveTextContent('2');
    const attention = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(attention).getByRole('link', { name: 'Make the app fast' })).toBeInTheDocument();
  });
});
