import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { ADMIN, renderApp, setupMockApi } from '@/test/utils';

function setup(view: string, name = 'Website Redesign') {
  const db = setupMockApi(ADMIN);
  const p = db.projects.find((x) => x.name === name)!;
  const utils = renderApp(`/projects/${p.id}/${view}`, { db });
  return { ...utils, project: p };
}

describe('board view', () => {
  it('renders a region per section with task cards (e2e contract)', async () => {
    setup('board');
    const todo = await screen.findByRole('region', { name: 'To do' });
    expect(within(todo).getByText('Draft new homepage copy')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'In progress' })).toHaveTextContent('Build responsive header');
    expect(screen.getByRole('region', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Untitled section' })).toHaveTextContent('Unsorted idea: dark mode');
    expect(screen.getByRole('link', { name: /board/i })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the task dialog when a card title is clicked', async () => {
    setup('board');
    await userEvent.click(await screen.findByText('Set up analytics'));
    expect(await screen.findByRole('dialog', { name: 'Set up analytics' })).toBeInTheDocument();
  });

  it('quick-adds a card into a column', async () => {
    const { db } = setup('board');
    const user = userEvent.setup();
    const done = await screen.findByRole('region', { name: 'Done' });
    await user.click(within(done).getByRole('button', { name: 'Add a task' }));
    await user.type(within(done).getByRole('textbox', { name: /new task name/i }), 'Retro{Enter}');
    expect(await within(done).findByText('Retro')).toBeInTheDocument();
    const doneSection = db.sections.find((s) => s.name === 'Done' && s.projectId === db.tasks.find((t) => t.title === 'Retro')!.projectId)!;
    expect(db.tasks.find((t) => t.title === 'Retro')!.sectionId).toBe(doneSection.id);
  });

  it('completes a task from its card', async () => {
    const { db } = setup('board');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Mark "Set up analytics" complete' }));
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'Set up analytics')!.completed).toBe(true));
  });
});

describe('calendar view', () => {
  it('places tasks on their due date and navigates months', async () => {
    setup('calendar');
    const today = new Date();
    const cell = await screen.findByRole('gridcell', { name: format(today, 'EEEE, MMMM d') });
    expect(within(cell).getByText('Build responsive header')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: format(today, 'MMMM yyyy') })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    expect(screen.getByRole('heading', { name: format(next, 'MMMM yyyy') })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: format(today, 'MMMM yyyy') })).toBeInTheDocument();
  });

  it('adds a task on a specific day', async () => {
    const { db } = setup('calendar');
    const user = userEvent.setup();
    const day = new Date();
    day.setDate(day.getDate() === 15 ? 16 : 15);
    const label = format(day, 'EEEE, MMMM d');
    const cell = await screen.findByRole('gridcell', { name: label });
    await user.click(within(cell).getByRole('button', { name: `Add a task on ${label}` }));
    await user.type(within(cell).getByRole('textbox', { name: /new task name/i }), 'Calendar task{Enter}');
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'Calendar task')?.dueDate).toBe(format(day, 'yyyy-MM-dd')));
    expect(await within(cell).findByText('Calendar task')).toBeInTheDocument();
  });
});

describe('my tasks', () => {
  it('groups my incomplete tasks into due-date buckets', async () => {
    renderApp('/my-tasks', { loginAs: ADMIN });
    const overdue = await screen.findByRole('region', { name: 'Overdue' });
    expect(within(overdue).getByText('Audit accessibility of nav')).toBeInTheDocument();
    expect(within(overdue).getByText('Expense report')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Build responsive header')).toBeInTheDocument();
    // subtasks assigned to me are included
    expect(screen.getByText('Mobile breakpoints')).toBeInTheDocument();
    // other people's tasks and completed tasks are not
    expect(screen.queryByText('Pick a font pairing')).not.toBeInTheDocument();
    expect(screen.queryByText('Kickoff meeting')).not.toBeInTheDocument();
    // personal tasks are labelled
    const row = screen.getByText('Expense report').closest('[role="row"]') as HTMLElement;
    expect(within(row).getByText('Personal')).toBeInTheDocument();
  });

  it('adds a personal task assigned to me', async () => {
    const { db } = renderApp('/my-tasks', { loginAs: ADMIN });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add task/i }));
    await user.type(screen.getByRole('textbox', { name: /new task name/i }), 'Call the bank{Enter}');
    const none = await screen.findByRole('region', { name: 'No due date' });
    expect(await within(none).findByText('Call the bank')).toBeInTheDocument();
    const admin = db.users.find((u) => u.email === ADMIN)!;
    expect(db.tasks.find((t) => t.title === 'Call the bank')).toMatchObject({ projectId: null, assigneeId: admin.id });
  });

  it('shows a toast and rolls back when the server rejects a change', async () => {
    const db = setupMockApi(ADMIN);
    renderApp('/my-tasks', { db });
    const user = userEvent.setup();
    const checkbox = await screen.findByRole('checkbox', { name: 'Mark "Expense report" complete' });
    // Make the task disappear server-side so the PATCH 404s.
    db.tasks = db.tasks.filter((t) => t.title !== 'Expense report');
    await user.click(checkbox);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not found/i);
  });
});
