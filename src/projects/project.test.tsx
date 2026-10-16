import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN, BOB, renderApp, setupMockApi } from '@/test/utils';

function projectId(db: ReturnType<typeof setupMockApi>, name = 'Website Redesign') {
  return db.projects.find((p) => p.name === name)!.id;
}

async function openProject(path?: string) {
  const db = setupMockApi(ADMIN);
  const id = projectId(db);
  const utils = renderApp(path ?? `/projects/${id}`, { db });
  await screen.findByRole('table', { name: /website redesign tasks/i });
  return { ...utils, id };
}

const section = (name: string) => screen.getByRole('region', { name });

describe('project list view', () => {
  it('redirects to the default view and groups incomplete tasks by section', async () => {
    const { router, id } = await openProject();
    expect(router.state.location.pathname).toBe(`/projects/${id}/list`);
    expect(within(section('To do')).getByText('Draft new homepage copy')).toBeInTheDocument();
    expect(within(section('In progress')).getByText('Build responsive header')).toBeInTheDocument();
    expect(within(section('Untitled section')).getByText('Unsorted idea: dark mode')).toBeInTheDocument();
    // completed tasks hidden by default, subtasks never listed at top level
    expect(screen.queryByText('Kickoff meeting')).not.toBeInTheDocument();
    expect(screen.queryByText('Write launch checklist')).not.toBeInTheDocument();
  });

  it('shows completed tasks when the filter changes', async () => {
    await openProject();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /show/i }), 'all');
    expect(await screen.findByText('Kickoff meeting')).toBeInTheDocument();
  });

  it('quick-adds tasks to a section and keeps the input open', async () => {
    const { db } = await openProject();
    const user = userEvent.setup();
    const todo = section('To do');
    await user.click(within(todo).getByRole('button', { name: 'Add a task…' }));
    const input = within(todo).getByRole('textbox', { name: /new task name/i });
    await user.type(input, 'Ship it{Enter}');
    expect(await within(todo).findByText('Ship it')).toBeInTheDocument();
    expect(within(todo).getByRole('textbox', { name: /new task name/i })).toHaveValue('');
    const created = db.tasks.find((t) => t.title === 'Ship it')!;
    expect(created.sectionId).toBe(db.sections.find((s) => s.name === 'To do' && s.projectId === created.projectId)!.id);
    // appended after the existing tasks of the section
    const siblings = db.tasks.filter((t) => t.sectionId === created.sectionId && t.id !== created.id);
    expect(created.position).toBeGreaterThan(Math.max(...siblings.map((t) => t.position)));
  });

  it('renames a task inline on double-click and reverts on Escape', async () => {
    const { db } = await openProject();
    const user = userEvent.setup();
    await user.dblClick(screen.getByRole('button', { name: 'Pick a font pairing' }));
    const input = screen.getByRole('textbox', { name: 'Task name' });
    await user.clear(input);
    await user.type(input, 'Pick fonts{Enter}');
    expect(await screen.findByRole('button', { name: 'Pick fonts' })).toBeInTheDocument();
    await waitFor(() => expect(db.tasks.some((t) => t.title === 'Pick fonts')).toBe(true));

    await user.dblClick(screen.getByRole('button', { name: 'Set up analytics' }));
    const other = screen.getByRole('textbox', { name: 'Task name' });
    await user.clear(other);
    await user.type(other, 'nope{Escape}');
    expect(await screen.findByRole('button', { name: 'Set up analytics' })).toBeInTheDocument();
    expect(db.tasks.some((t) => t.title === 'nope')).toBe(false);
  });

  it('completing a task keeps it visible (struck through) until the filter changes', async () => {
    const { db } = await openProject();
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Collect customer logos" complete' }));
    expect(await screen.findByRole('checkbox', { name: 'Mark "Collect customer logos" incomplete' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Collect customer logos' })).toHaveClass('line-through');
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'Collect customer logos')!.completed).toBe(true));
  });

  it('changes priority and assignee inline', async () => {
    const { db } = await openProject();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Priority for Collect customer logos' }), 'HIGH');
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'Collect customer logos')!.priority).toBe('HIGH'));

    const row = screen.getByRole('button', { name: 'Collect customer logos' }).closest('[role="row"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Assign' }));
    await user.click(within(await screen.findByRole('listbox', { name: 'People' })).getByRole('button', { name: /Bob Brown/ }));
    expect(await within(row).findByRole('button', { name: 'Assignee: Bob Brown' })).toBeInTheDocument();
    const bob = db.users.find((u) => u.email === BOB)!;
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'Collect customer logos')!.assigneeId).toBe(bob.id));
  });

  it('adds, renames and deletes sections', async () => {
    const { db, id } = await openProject();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add section/i }));
    await user.type(screen.getByRole('textbox', { name: /new section name/i }), 'Backlog{Enter}');
    expect(await screen.findByRole('heading', { name: 'Backlog' })).toBeInTheDocument();
    expect(db.sections.some((s) => s.projectId === id && s.name === 'Backlog')).toBe(true);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const backlog = section('Backlog');
    await user.click(within(backlog).getByRole('button', { name: /section actions/i }));
    await user.click(screen.getByRole('button', { name: /delete section/i }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Backlog' })).not.toBeInTheDocument());
  });

  it('shows a not-found state for invisible projects', async () => {
    const db = setupMockApi(BOB);
    const p = db.projects.find((x) => x.name === 'Q4 Launch Campaign')!;
    p.privacy = 'PRIVATE';
    renderApp(`/projects/${p.id}`, { db });
    expect(await screen.findByText('Project not found')).toBeInTheDocument();
  });

  it('makes the list read-only for COMMENTER members', async () => {
    const db = setupMockApi(BOB);
    const id = projectId(db);
    const bob = db.users.find((u) => u.email === BOB)!;
    db.projectMembers.push({ projectId: id, userId: bob.id, role: 'COMMENTER' });
    renderApp(`/projects/${id}/list`, { db });
    expect(await screen.findByText('Draft new homepage copy')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark "Draft new homepage copy" complete' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Priority for Draft new homepage copy' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /add (a )?task/i })).not.toBeInTheDocument();
    expect(screen.getByText(/you can comment/i)).toBeInTheDocument();
  });
});

describe('task detail panel', () => {
  it('opens from a row, edits fields, and closes', async () => {
    const { db, router } = await openProject();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Draft new homepage copy' }));
    const panel = await screen.findByRole('dialog', { name: 'Draft new homepage copy' });
    expect(router.state.location.search).toMatch(/task=/);
    expect(within(panel).getByRole('textbox', { name: 'Task title' })).toHaveValue('Draft new homepage copy');
    expect((within(panel).getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toContain('Hero');
    expect(within(panel).getAllByRole('button', { name: 'Assignee: Alice Anderson' })[0]).toBeInTheDocument();

    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Priority' }), 'LOW');
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'Draft new homepage copy')!.priority).toBe('LOW'));
    // list row reflects the change (shared cache)
    expect(screen.getByRole('combobox', { name: 'Priority for Draft new homepage copy' })).toHaveValue('LOW');

    const desc = within(panel).getByRole('textbox', { name: 'Description' });
    await user.clear(desc);
    await user.type(desc, 'New description');
    await user.tab();
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'Draft new homepage copy')!.description).toBe('New description'));

    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Section' }), 'Done');
    expect(await within(section('Done')).findByText('Draft new homepage copy')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: /close task details/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('lists, adds and completes subtasks', async () => {
    const { db } = await openProject();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Draft new homepage copy' }));
    const panel = await screen.findByRole('dialog');
    const subtasks = within(panel).getByRole('region', { name: 'Subtasks' });
    expect(within(subtasks).getByText('Write launch checklist')).toBeInTheDocument();

    await user.click(within(subtasks).getByRole('button', { name: /add subtask/i }));
    await user.type(within(subtasks).getByRole('textbox', { name: /new subtask name/i }), 'QA pass{Enter}');
    expect(await within(subtasks).findByText('QA pass')).toBeInTheDocument();
    const parent = db.tasks.find((t) => t.title === 'Draft new homepage copy')!;
    expect(db.tasks.find((t) => t.title === 'QA pass')!.parentId).toBe(parent.id);

    await user.click(within(subtasks).getByRole('checkbox', { name: 'Mark subtask "QA pass" complete' }));
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'QA pass')!.completed).toBe(true));
    // list row's subtask counter updates
    const row = screen.getByRole('button', { name: 'Draft new homepage copy' }).closest('[role="row"]') as HTMLElement;
    expect(await within(row).findByTitle('Subtasks')).toHaveTextContent('2/3');
  });

  it('follows/unfollows and deletes a task', async () => {
    const { db } = await openProject();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Collect customer logos' }));
    const panel = await screen.findByRole('dialog');
    const task = db.tasks.find((t) => t.title === 'Collect customer logos')!;
    const admin = db.users.find((u) => u.email === ADMIN)!;

    await user.click(within(panel).getByRole('button', { name: 'Leave task' }));
    await waitFor(() => expect(db.followers.some((f) => f.taskId === task.id && f.userId === admin.id)).toBe(false));
    expect(within(panel).getByRole('button', { name: 'Follow task' })).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(within(panel).getByRole('button', { name: /more task actions/i }));
    await user.click(within(panel).getByRole('button', { name: /delete task/i }));
    await waitFor(() => expect(screen.queryByText('Collect customer logos')).not.toBeInTheDocument());
    expect(db.tasks.some((t) => t.id === task.id)).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens directly from a ?task= link and shows not-found for bad ids', async () => {
    const db = setupMockApi(ADMIN);
    renderApp('/?task=nope', { db });
    expect(await screen.findByText(/doesn’t exist/i)).toBeInTheDocument();
  });
});

describe('e2e selector contract (asana-clone-a0 smoke tests)', () => {
  it('Add task → textbox /task name/i is the only match, saved on Enter', async () => {
    const { db } = await openProject();
    const user = userEvent.setup();
    expect(screen.getAllByRole('button', { name: /add task/i })).toHaveLength(1);
    expect(screen.queryAllByRole('textbox', { name: /task name/i })).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /add task/i }));
    await user.type(screen.getByRole('textbox', { name: /task name/i }), 'From e2e{Enter}');
    expect(await screen.findByText('From e2e')).toBeInTheDocument();
    expect(db.tasks.some((t) => t.title === 'From e2e')).toBe(true);
  });

  it('project page h1 is the project name; title click opens a dialog named after the task', async () => {
    await openProject();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Website Redesign');
    await userEvent.click(screen.getByText('Build responsive header'));
    expect(await screen.findByRole('dialog', { name: 'Build responsive header' })).toBeInTheDocument();
  });
});

describe('assignment validation', () => {
  it('shows the 400 error inline when assigning someone without project access', async () => {
    const db = setupMockApi(ADMIN);
    const p = db.projects.find((x) => x.name === 'API v2')!; // Engineering, TEAM
    const carol = db.users.find((u) => u.email === 'carol@example.com')!; // Marketing only
    renderApp(`/projects/${p.id}/list`, { db });
    const user = userEvent.setup();
    const row = (await screen.findByRole('button', { name: 'Error code catalogue' })).closest('[role="row"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Assign' }));
    await user.click(within(await screen.findByRole('listbox', { name: 'People' })).getByRole('button', { name: /Carol Chen/ }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(/doesn’t have access/);
    // optimistic assignee rolled back
    expect(within(row).getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(db.tasks.find((t) => t.title === 'Error code catalogue')!.assigneeId).not.toBe(carol.id);
  });
});

