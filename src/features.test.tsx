import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN, ALICE, BOB, renderApp, setupMockApi } from '@/test/utils';

const user = () => userEvent.setup();

async function openTask(title: string, loginAs = ADMIN) {
  const db = setupMockApi(loginAs);
  const task = db.tasks.find((t) => t.title === title)!;
  const utils = renderApp(`/projects/${task.projectId}/list?task=${task.id}`, { db });
  const dialog = await screen.findByRole('dialog', { name: title });
  return { ...utils, task, dialog };
}

describe('comments & activity', () => {
  it('posts a comment with an @mention picked from the autocomplete (e2e selectors)', async () => {
    const { db, task, dialog } = await openTask('Pick a font pairing');
    const u = user();
    const box = within(dialog.parentElement!).getByRole('textbox', { name: /comment/i });
    await u.type(box, 'Thoughts @ali');
    await u.click(within(await screen.findByRole('listbox', { name: 'Mention someone' })).getByRole('button', { name: /Alice Anderson/ }));
    expect(box).toHaveValue('Thoughts @Alice Anderson ');
    await u.type(box, 'please');
    await u.click(screen.getByRole('button', { name: 'Comment' }));

    const alice = db.users.find((x) => x.email === ALICE)!;
    await waitFor(() =>
      expect(db.comments.find((c) => c.taskId === task.id)?.body).toBe(`Thoughts @[Alice Anderson](${alice.id}) please`),
    );
    const feed = screen.getByRole('region', { name: 'Comments and activity' });
    expect(await within(feed).findByText('@Alice Anderson')).toHaveAttribute('data-user-id', alice.id);
    expect(box).toHaveValue('');
    expect(db.notifications.some((n) => n.userId === alice.id && n.type === 'MENTIONED' && n.taskId === task.id)).toBe(true);
  });

  it('renders comment bodies as text, never HTML', async () => {
    const db = setupMockApi(ADMIN);
    const task = db.tasks.find((t) => t.title === 'Pick a font pairing')!;
    db.comments.push({ id: 'c-x', taskId: task.id, authorId: db.users[1].id, body: '<img src=x onerror="window.__xss=1"> https://ok.example/a', createdAt: new Date().toISOString(), editedAt: null });
    renderApp(`/projects/${task.projectId}/list?task=${task.id}`, { db });
    const feed = await screen.findByRole('region', { name: 'Comments and activity' });
    expect(await within(feed).findByText(/<img src=x/)).toBeInTheDocument();
    expect(feed.querySelector('img')).toBeNull();
    expect(within(feed).getByRole('link', { name: 'https://ok.example/a' })).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('edits and deletes my own comment', async () => {
    const { db, dialog } = await openTask('Pick a font pairing');
    const u = user();
    await u.type(within(dialog.parentElement!).getByRole('textbox', { name: /add a comment/i }), 'first');
    await u.click(screen.getByRole('button', { name: 'Comment' }));
    const feed = screen.getByRole('region', { name: 'Comments and activity' });
    await within(feed).findByText('first');

    await u.click(within(feed).getByRole('button', { name: 'Edit' }));
    const edit = within(feed).getByRole('textbox', { name: 'Edit comment' });
    await u.clear(edit);
    await u.type(edit, 'second');
    await u.click(within(feed).getByRole('button', { name: 'Save' }));
    expect(await within(feed).findByText('second')).toBeInTheDocument();
    expect(within(feed).getByText('(edited)')).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await u.click(within(feed).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(feed).queryByText('second')).not.toBeInTheDocument());
    expect(db.comments.some((c) => c.body === 'second')).toBe(false);
  });

  it('shows activity stories and can filter to comments only', async () => {
    const { dialog } = await openTask('Draft new homepage copy');
    const u = user();
    await u.selectOptions(within(dialog).getByRole('combobox', { name: 'Priority' }), 'LOW');
    const feed = screen.getByRole('region', { name: 'Comments and activity' });
    expect(await within(feed).findByText(/changed the priority to Low/)).toBeInTheDocument();
    expect(within(feed).getByText(/created this task/)).toBeInTheDocument();
    expect(within(feed).getByText(/can you review the tone/)).toBeInTheDocument();

    await u.click(within(feed).getByRole('button', { name: 'Comments' }));
    expect(within(feed).queryByText(/created this task/)).not.toBeInTheDocument();
    expect(within(feed).getByText(/can you review the tone/)).toBeInTheDocument();
  });

  it('lets COMMENTER members comment while the task stays read-only', async () => {
    const db = setupMockApi(BOB);
    const task = db.tasks.find((t) => t.title === 'Pick a font pairing')!;
    const bob = db.users.find((x) => x.email === BOB)!;
    db.projectMembers.push({ projectId: task.projectId!, userId: bob.id, role: 'COMMENTER' });
    renderApp(`/projects/${task.projectId}/list?task=${task.id}`, { db });
    const dialog = await screen.findByRole('dialog', { name: 'Pick a font pairing' });
    expect(within(dialog).getByRole('textbox', { name: 'Task title' })).toBeDisabled();
    const u = user();
    await u.type(within(dialog.parentElement!).getByRole('textbox', { name: /comment/i }), 'looks good');
    await u.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(db.comments.some((c) => c.body === 'looks good')).toBe(true));
  });
});

describe('inbox', () => {
  it('lists notifications, opens the task and marks it read', async () => {
    const { db } = renderApp('/inbox', { loginAs: ADMIN });
    const list = await screen.findByRole('list', { name: 'Notifications' });
    expect(within(list).getByText(/mentioned you in/)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByLabelText('2 unread')).toBeInTheDocument();

    await user().click(within(list).getByRole('button', { name: /Alice Anderson mentioned you in Draft new homepage copy/ }));
    expect(await screen.findByRole('dialog', { name: 'Draft new homepage copy' })).toBeInTheDocument();
    expect(await within(nav).findByLabelText('1 unread')).toBeInTheDocument();
    await waitFor(() => expect(db.notifications.filter((n) => !n.read)).toHaveLength(1));
  });

  it('marks all as read and filters unread', async () => {
    const { db } = renderApp('/inbox', { loginAs: ADMIN });
    const u = user();
    await screen.findByRole('list', { name: 'Notifications' });
    await u.click(screen.getByRole('button', { name: /mark all as read/i }));
    await waitFor(() => expect(db.notifications.every((n) => n.read)).toBe(true));
    await u.click(screen.getByRole('button', { name: /^unread/i }));
    expect(await screen.findByText('No unread notifications')).toBeInTheDocument();
  });
});

describe('global search', () => {
  it('opens with Ctrl+K and jumps to a task', async () => {
    const { router } = renderApp('/', { loginAs: ADMIN });
    await screen.findByRole('navigation', { name: 'Main' });
    const u = user();
    await u.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox', { name: /search/i });
    await u.type(input, 'header');
    const results = screen.getByRole('listbox', { name: 'Search results' });
    expect(await within(results).findByText('Build responsive header')).toBeInTheDocument();
    await u.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Build responsive header' })).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/^\/projects\/.+\/list$/);
  });

  it('groups projects and people and needs 2+ characters', async () => {
    renderApp('/', { loginAs: ADMIN });
    const u = user();
    await u.click(await screen.findByRole('button', { name: /^search/i }));
    const input = await screen.findByRole('combobox', { name: /search/i });
    await u.type(input, 'a');
    expect(screen.getByText(/at least 2 characters/)).toBeInTheDocument();
    await u.type(input, 'p');
    const results = screen.getByRole('listbox', { name: 'Search results' });
    expect(await within(results).findByRole('group', { name: 'Projects' })).toHaveTextContent('API v2');
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox', { name: /search/i })).not.toBeInTheDocument());
  });
});

describe('new project dialog (e2e selectors)', () => {
  it('members only see their own teams; creating navigates to the project', async () => {
    const { router, db } = renderApp('/', { loginAs: BOB });
    const u = user();
    await u.click(await screen.findByRole('button', { name: /new project/i }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    const team = within(dialog).getByRole('combobox', { name: 'Team' });
    await waitFor(() => expect(within(team).getAllByRole('option').map((o) => o.textContent)).toEqual(['Engineering']));
    await u.type(within(dialog).getByRole('textbox', { name: /name/i }), 'Bob’s project');
    await u.click(within(dialog).getByRole('button', { name: /create/i }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/projects\/.+\/list$/));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bob’s project' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('link', { name: 'Bob’s project' })).toBeInTheDocument();
    expect(db.projects.find((p) => p.name === 'Bob’s project')!.ownerId).toBe(db.users.find((x) => x.email === BOB)!.id);
  });

  it('admins can pick any team', async () => {
    renderApp('/', { loginAs: ADMIN });
    await user().click(await screen.findByRole('button', { name: /new project/i }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    const team = within(dialog).getByRole('combobox', { name: 'Team' });
    await waitFor(() => expect(within(team).getAllByRole('option')).toHaveLength(2));
  });
});

describe('project settings', () => {
  it('renames the project and shows the 409 when demoting the last owner', async () => {
    const db = setupMockApi(ADMIN);
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    renderApp(`/projects/${p.id}/list`, { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Project settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Project settings' });
    const name = within(dialog).getByRole('textbox', { name: 'Project name' });
    await u.clear(name);
    await u.type(name, 'Website v2');
    await u.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Website v2' })).toBeInTheDocument();

    await u.click(within(dialog).getByRole('tab', { name: /members/i }));
    await u.selectOptions(within(dialog).getByRole('combobox', { name: 'Role for Ada Admin' }), 'EDITOR');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/at least one owner/i);
  });

  it('is read-only for non-owners', async () => {
    const db = setupMockApi(BOB);
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    renderApp(`/projects/${p.id}/list`, { db });
    await user().click(await screen.findByRole('button', { name: 'Project settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Project settings' });
    expect(within(dialog).getByRole('textbox', { name: 'Project name' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: /delete project/i })).not.toBeInTheDocument();
  });
});

describe('teams', () => {
  it('creates a team and adds a member', async () => {
    const { db } = renderApp('/teams', { loginAs: ALICE });
    const u = user();
    await u.click(await screen.findByRole('button', { name: /new team/i }));
    const dialog = await screen.findByRole('dialog', { name: 'New team' });
    await u.type(within(dialog).getByRole('textbox', { name: 'Team name' }), 'Design');
    await u.click(within(dialog).getByRole('button', { name: 'Create team' }));
    expect(await screen.findByDisplayValue('Design')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Add team member' }));
    await u.click(within(await screen.findByRole('listbox', { name: 'People' })).getByRole('button', { name: /Bob Brown/ }));
    const members = screen.getByRole('list', { name: 'Team members' });
    expect(await within(members).findByText('Bob Brown')).toBeInTheDocument();
    const team = db.teams.find((t) => t.name === 'Design')!;
    expect(db.teamMembers.filter((m) => m.teamId === team.id)).toHaveLength(2);
  });

  it('shows the 409 when deleting a team that still has projects', async () => {
    const db = setupMockApi(ADMIN);
    const eng = db.teams.find((t) => t.name === 'Engineering')!;
    renderApp(`/teams/${eng.id}`, { db });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user().click(await screen.findByRole('button', { name: 'Delete team' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/still has projects/i);
  });
});

describe('admin', () => {
  it('changes roles and deactivates users', async () => {
    const { db } = renderApp('/admin', { loginAs: ADMIN });
    const u = user();
    await u.selectOptions(await screen.findByRole('combobox', { name: 'Role for Bob Brown' }), 'ADMIN');
    await waitFor(() => expect(db.users.find((x) => x.email === BOB)!.role).toBe('ADMIN'));
    expect(screen.getByRole('combobox', { name: 'Role for Ada Admin' })).toBeDisabled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const row = screen.getByText('Bob Brown').closest('tr')!;
    await u.click(within(row).getByRole('button', { name: 'Deactivate' }));
    expect(await within(row).findByText('Deactivated')).toBeInTheDocument();
    expect(db.users.find((x) => x.email === BOB)!.isActive).toBe(false);
  });

  it('creates an invite link, lists it as pending with inviter, and revokes it', async () => {
    const { db } = renderApp('/admin', { loginAs: ADMIN });
    const u = user();
    await u.click(await screen.findByRole('tab', { name: 'Invites' }));
    await u.type(screen.getByRole('textbox', { name: 'Email address' }), 'dana@example.com');
    await u.click(screen.getByRole('button', { name: /create invite link/i }));
    const link = (await screen.findByRole('textbox', { name: 'Invite link' })) as HTMLInputElement;
    expect(link.value).toMatch(/\/invite\/[0-9a-f]+$/);

    const pending = await screen.findByRole('list', { name: 'Pending invites' });
    expect(within(pending).getByText(/dana@example.com/)).toBeInTheDocument();
    expect(within(pending).getByText(/by Ada Admin/)).toBeInTheDocument();
    await u.click(within(pending).getByRole('button', { name: 'Revoke invite for dana@example.com' }));
    await waitFor(() => expect(db.invites).toHaveLength(0));
  });

  it('shows duplicate-user errors inline', async () => {
    renderApp('/admin', { loginAs: ADMIN });
    const u = user();
    await u.click(await screen.findByRole('tab', { name: 'Invites' }));
    await u.type(screen.getByRole('textbox', { name: 'Email address' }), BOB);
    await u.click(screen.getByRole('button', { name: /create invite link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});

describe('profile', () => {
  it('updates my name', async () => {
    const { db } = renderApp('/', { loginAs: ALICE });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'My profile' }));
    const dialog = await screen.findByRole('dialog', { name: 'My profile' });
    const name = within(dialog).getByRole('textbox', { name: 'Full name' });
    await u.clear(name);
    await u.type(name, 'Alice A.');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(db.users.find((x) => x.email === ALICE)!.name).toBe('Alice A.'));
    expect(await screen.findByText(/Good (morning|afternoon|evening), Alice/)).toBeInTheDocument();
  });
});
