import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setFetch } from '@/api/client';
import { createMockFetch } from '@/mocks/backend';
import type { MockDb } from '@/mocks/db';
import { ADMIN, ALICE, BOB, GUEST, renderApp, setupMockApi } from '@/test/utils';
import { getWorkspaceId } from '../workspaceId';

// SPEC §12 FE part B: workspace settings, guests, leaving, and invites for existing accounts.
const user = () => userEvent.setup();
const mainNav = () => screen.getByRole('navigation', { name: 'Main' });
const expectCurrent = (name: string) =>
  waitFor(() => expect(within(mainNav()).getByRole('button', { name: 'Workspace menu' })).toHaveTextContent(name));
/** The toast store outlives a test, so match by text. */
const expectToast = (text: string) =>
  waitFor(() => expect(screen.getAllByRole('status').map((t) => t.textContent).join('|')).toContain(text));
const wsId = (db: MockDb, name: string) => db.workspaces.find((w) => w.name === name)!.id;
const userId = (db: MockDb, email: string) => db.users.find((u) => u.email === email)!.id;
const membership = (db: MockDb, ws: string, email: string) => db.workspaceMembers.find((m) => m.workspaceId === wsId(db, ws) && m.userId === userId(db, email))!;

/** alice, currently in Acme Pilot (where she is ADMIN). */
function aliceInAcme() {
  const db = setupMockApi(ALICE);
  db.users.find((u) => u.email === ALICE)!.lastWorkspaceId = wsId(db, 'Acme Pilot');
  return db;
}

/** An outside MEMBER of Acme who owns a project and is on its team — for organization conversion. */
function addExternalMember(db: MockDb) {
  const acme = wsId(db, 'Acme Pilot');
  const now = new Date().toISOString();
  db.users.push({ id: 'user-zed', email: 'zed@outside.test', name: 'Zed Outsider', password: 'password123', isActive: true, avatarColor: '#4186e0', createdAt: now, lastWorkspaceId: acme });
  db.workspaceMembers.push({ workspaceId: acme, userId: 'user-zed', role: 'MEMBER', isActive: true, joinedAt: now });
  const team = db.teams.find((t) => t.name === 'Pilot Team')!;
  db.teamMembers.push({ teamId: team.id, userId: 'user-zed' });
  const notes = db.projects.find((p) => p.name === 'Pilot internal notes')!;
  db.projectMembers = db.projectMembers.filter((m) => m.projectId !== notes.id);
  db.projectMembers.push({ projectId: notes.id, userId: 'user-zed', role: 'OWNER' });
  return { team, notes };
}

describe('guest experience (e2e spec 09 selectors)', () => {
  it('shows the Guest pill and note, only their project, and hides member-only features', async () => {
    renderApp('/', { loginAs: GUEST });
    await expectCurrent('Acme Pilot');
    const nav = mainNav();
    expect(within(nav).getByText('Guest', { exact: true })).toBeInTheDocument();
    expect(within(nav).getByText(/You're a guest in Acme Pilot/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Workspaces' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Goals' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Browse' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /new project/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Workspace settings' })).not.toBeInTheDocument();

    const links = await within(nav).findAllByRole('link', { name: 'Pilot Rollout' });
    expect(links).toHaveLength(1);
    expect(within(nav).queryByRole('link', { name: 'Pilot internal notes' })).not.toBeInTheDocument();
    await user().click(links[0]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Pilot Rollout' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Pilot Rollout tasks' })).toBeInTheDocument();
  });

  it('gets a friendly note instead of goals or teams by URL', async () => {
    renderApp('/goals', { loginAs: GUEST });
    expect(await screen.findByRole('heading', { name: 'Goals aren’t available to guests' })).toBeInTheDocument();
    expect(screen.queryByRole('treeitem')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New goal' })).not.toBeInTheDocument();
  });

  it('has project reports only (no Workload or Goals tabs)', async () => {
    renderApp('/reporting?tab=workload', { loginAs: GUEST });
    const tabs = await screen.findByRole('tablist', { name: 'Reports' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview']);
    expect(within(tabs).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it("can't manage projects, even as OWNER (W7)", async () => {
    const db = setupMockApi(GUEST);
    const rollout = db.projects.find((p) => p.name === 'Pilot Rollout')!;
    db.projectMembers.find((m) => m.projectId === rollout.id && m.userId === userId(db, GUEST))!.role = 'OWNER';
    renderApp(`/projects/${rollout.id}/list`, { db });
    await screen.findByRole('heading', { level: 1, name: 'Pilot Rollout' });
    await user().click(screen.getByRole('button', { name: 'Project settings' }));
    expect(await screen.findByText('Only the project owner or an admin can change settings.')).toBeInTheDocument();
  });
});

describe('guest-aware pickers (W2, W7, W8)', () => {
  it('badges guests among project members and never offers them Owner', async () => {
    const db = aliceInAcme();
    const rollout = db.projects.find((p) => p.name === 'Pilot Rollout')!;
    renderApp(`/projects/${rollout.id}/list`, { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: /^Project members/ }));
    const list = await screen.findByRole('list', { name: 'Project members' });
    const gina = within(list).getByText('Gina Guest').closest('li')!;
    await waitFor(() => expect(within(gina).getByText('Guest')).toBeInTheDocument());
    const select = within(gina).getByRole('combobox', { name: 'Role for Gina Guest' });
    expect(within(select).getByRole('option', { name: 'Owner' })).toBeDisabled();
    expect(within(select).getByRole('option', { name: 'Editor' })).not.toBeDisabled();

    // Adding someone as Owner leaves guests out of the picker.
    await u.selectOptions(screen.getByRole('combobox', { name: 'Role for new member' }), 'OWNER');
    await u.click(screen.getByRole('button', { name: /add member/i }));
    const people = await screen.findByRole('listbox', { name: 'People' });
    expect(within(people).queryByText('Gina Guest')).not.toBeInTheDocument();
  });

  it('leaves guests out of the team member picker', async () => {
    const db = aliceInAcme();
    // Gina is on a project, so she'd otherwise be pickable.
    const team = db.teams.find((t) => t.name === 'Pilot Team')!;
    renderApp(`/teams/${team.id}`, { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Add team member' }));
    const people = await screen.findByRole('listbox', { name: 'People' });
    await waitFor(() => expect(within(people).queryByText('No matches')).toBeInTheDocument());
    expect(within(people).queryByText('Gina Guest')).not.toBeInTheDocument();
  });
});

describe('workspace settings', () => {
  it('is admin-only and opens on General; /admin redirects there', async () => {
    const { router } = renderApp('/admin', { loginAs: ADMIN });
    expect(await screen.findByRole('heading', { name: 'Workspace settings' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/workspace/settings');
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renames the workspace and the switcher follows', async () => {
    const db = aliceInAcme();
    renderApp('/workspace/settings', { db });
    const u = user();
    const name = await screen.findByRole('textbox', { name: 'Workspace name' });
    await u.clear(name);
    await u.type(name, 'Acme Launch');
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    await expectToast('Workspace updated');
    await expectCurrent('Acme Launch');
    expect(db.workspaces.find((w) => w.id === getWorkspaceId())!.name).toBe('Acme Launch');
  });

  it('converts to an organization, showing who becomes a guest (W4, W5, W7)', async () => {
    const db = aliceInAcme();
    const { team, notes } = addExternalMember(db);
    // The seed's Mekari already uses example.com (a domain belongs to one workspace → 409).
    Object.assign(db.workspaces.find((w) => w.name === 'Mekari')!, { isOrganization: false, domain: null });
    db.invites.push({ id: 'inv-out', workspaceId: wsId(db, 'Acme Pilot'), email: 'pat@elsewhere.test', role: 'MEMBER', token: 'tok-out', invitedById: userId(db, ALICE), expiresAt: new Date(Date.now() + 864e5).toISOString(), acceptedAt: null, createdAt: new Date().toISOString() });
    renderApp('/workspace/settings?tab=organization', { db });
    const u = user();
    const domain = await screen.findByRole('textbox', { name: 'Email domain' });
    expect(domain).toHaveValue('example.com'); // prefilled from my email
    await u.click(screen.getByRole('button', { name: 'Convert to organization' }));

    const dialog = await screen.findByRole('dialog', { name: 'Convert to an organization on example.com?' });
    const affected = await within(dialog).findByRole('list', { name: 'People who will become guests' });
    // Gina is already a guest; alice and bob are on example.com.
    expect(within(affected).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Zed Outsider')]);
    await u.click(within(dialog).getByRole('button', { name: 'Convert' }));

    await expectToast('Acme Pilot is now an organization · 1 person became guests');
    const acme = db.workspaces.find((w) => w.name === 'Acme Pilot')!;
    expect(acme).toMatchObject({ isOrganization: true, domain: 'example.com' });
    expect(membership(db, 'Acme Pilot', 'zed@outside.test').role).toBe('GUEST');
    expect(db.teamMembers.some((m) => m.teamId === team.id && m.userId === 'user-zed')).toBe(false); // W4
    expect(db.projectMembers.find((m) => m.projectId === notes.id && m.userId === 'user-zed')!.role).toBe('EDITOR'); // W7
    expect(db.projectMembers.find((m) => m.projectId === notes.id && m.role === 'OWNER')!.userId).toBe(userId(db, ALICE));
    expect(db.invites.find((i) => i.id === 'inv-out')!.role).toBe('GUEST'); // W5
  });

  it('members: Guest badge and role incl. Guest; external people can only be guests in an org', async () => {
    const db = setupMockApi(ADMIN); // Mekari: organization on example.com
    const now = new Date().toISOString();
    db.users.push({ id: 'user-ext', email: 'ext@partner.test', name: 'Eve External', password: 'password123', isActive: true, avatarColor: '#4186e0', createdAt: now, lastWorkspaceId: null });
    db.workspaceMembers.push({ workspaceId: wsId(db, 'Mekari'), userId: 'user-ext', role: 'GUEST', isActive: true, joinedAt: now });
    renderApp('/workspace/settings?tab=members', { db });
    const u = user();
    const eve = (await screen.findByText('Eve External')).closest('tr')!;
    expect(within(eve).getByText('Guest', { selector: 'span' })).toBeInTheDocument();
    const eveRole = within(eve).getByRole('combobox', { name: 'Role for Eve External' });
    expect(within(eveRole).getByRole('option', { name: 'Member' })).toBeDisabled();

    await u.selectOptions(screen.getByRole('combobox', { name: 'Role for Bob Brown' }), 'GUEST');
    await waitFor(() => expect(membership(db, 'Mekari', BOB).role).toBe('GUEST'));
    // W4: off Mekari's teams (still on Acme's).
    const mekariTeams = new Set(db.teams.filter((t) => t.workspaceId === wsId(db, 'Mekari')).map((t) => t.id));
    expect(db.teamMembers.some((m) => m.userId === userId(db, BOB) && mekariTeams.has(m.teamId))).toBe(false);
    expect(db.teamMembers.some((m) => m.userId === userId(db, BOB) && !mekariTeams.has(m.teamId))).toBe(true);
  });

  it('invites: external emails in an org are forced to Guest', async () => {
    const db = setupMockApi(ADMIN);
    renderApp('/workspace/settings?tab=invites', { db });
    const u = user();
    const role = await screen.findByRole('combobox', { name: 'Role' });
    await u.type(screen.getByRole('textbox', { name: 'Email address' }), 'sam@agency.test');
    expect(role).toBeDisabled();
    expect(role).toHaveValue('GUEST');
    expect(screen.getByText(/agency\.test isn’t on example\.com/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /create invite link/i }));
    await waitFor(() => expect(db.invites.find((i) => i.email === 'sam@agency.test')?.role).toBe('GUEST'));
  });

  it('deletes the workspace after typing its name and lands in another one', async () => {
    const db = aliceInAcme();
    renderApp('/workspace/settings?tab=danger', { db });
    const u = user();
    const button = await screen.findByRole('button', { name: 'Delete workspace' });
    await u.type(screen.getByRole('textbox', { name: /to confirm/ }), 'Acme');
    expect(button).toBeDisabled();
    await u.type(screen.getByRole('textbox', { name: /to confirm/ }), ' Pilot');
    await u.click(button);
    await expectToast('Deleted Acme Pilot');
    await expectCurrent('Mekari');
    expect(db.workspaces.some((w) => w.name === 'Acme Pilot')).toBe(false);
  });
});

describe('leaving a workspace', () => {
  it('lets a member leave from the workspace menu', async () => {
    const db = setupMockApi(BOB);
    db.users.find((u) => u.email === BOB)!.lastWorkspaceId = wsId(db, 'Acme Pilot');
    renderApp('/', { db });
    const u = user();
    await expectCurrent('Acme Pilot');
    await u.click(within(mainNav()).getByRole('button', { name: 'Workspace menu' }));
    await u.click(screen.getByRole('menuitem', { name: 'Leave Acme Pilot' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave Acme Pilot?' });
    await u.click(within(dialog).getByRole('button', { name: 'Leave workspace' }));
    await expectToast('You left Acme Pilot');
    await expectCurrent('Mekari');
    expect(db.workspaceMembers.some((m) => m.workspaceId === wsId(db, 'Acme Pilot') && m.userId === userId(db, BOB))).toBe(false);
  });

  it('shows the last-admin conflict inline', async () => {
    const db = aliceInAcme();
    renderApp('/workspace/settings', { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Leave workspace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave Acme Pilot?' });
    await u.click(within(dialog).getByRole('button', { name: 'Leave workspace' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/at least one admin/i);
    expect(membership(db, 'Acme Pilot', ALICE).isActive).toBe(true);
  });
});

describe('invite page for an existing account', () => {
  const inviteCarolToAcme = (db: MockDb) =>
    db.invites.push({ id: 'inv-carol', workspaceId: wsId(db, 'Acme Pilot'), email: 'carol@example.com', role: 'MEMBER', token: 'tok-carol', invitedById: userId(db, ALICE), expiresAt: new Date(Date.now() + 864e5).toISOString(), acceptedAt: null, createdAt: new Date().toISOString() });

  it('asks to log in, then joins on the way back', async () => {
    const db = setupMockApi();
    inviteCarolToAcme(db);
    const { router } = renderApp('/invite/tok-carol', { db });
    const link = await screen.findByRole('link', { name: 'Log in to join Acme Pilot' });
    expect(link).toHaveAttribute('href', `/login?next=${encodeURIComponent('/invite/tok-carol?join=1')}`);
    const u = user();
    await u.click(link);
    await u.type(await screen.findByLabelText('Email address'), 'carol@example.com');
    await u.type(screen.getByLabelText('Password'), 'password123');
    await u.click(screen.getByRole('button', { name: 'Log in' }));

    await expectToast('Welcome to Acme Pilot');
    await expectCurrent('Acme Pilot');
    expect(router.state.location.pathname).toBe('/');
    expect(membership(db, 'Acme Pilot', 'carol@example.com')).toMatchObject({ role: 'MEMBER', isActive: true });
    expect(db.invites.find((i) => i.id === 'inv-carol')!.acceptedAt).not.toBeNull();
  });

  it('tells a different logged-in user the invite is not theirs', async () => {
    const db = setupMockApi(BOB);
    inviteCarolToAcme(db);
    renderApp('/invite/tok-carol', { db });
    expect(await screen.findByRole('heading', { name: 'This invite is for someone else' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });
});

describe('deactivation copy', () => {
  it('confirms with the workspace in mind', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderApp('/workspace/settings?tab=members', { loginAs: ADMIN });
    const row = (await screen.findByText('Bob Brown')).closest('tr')!;
    await user().click(within(row).getByRole('button', { name: 'Deactivate' }));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('lose access to Mekari'));
  });
});

/** Serve the mock DB, but let `intercept` answer (or delay) chosen requests first. */
function interceptApi(db: MockDb, intercept: (method: string, path: string) => Promise<Response | undefined> | Response | undefined) {
  const inner = createMockFetch(() => db);
  setFetch(async (input, init) => {
    const hit = await intercept(init?.method ?? 'GET', new URL(input, 'http://x').pathname);
    return hit ?? inner(input, init);
  });
}
const fail500 = () => new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'Server exploded' } }), { status: 500 });

describe('review fixes (#25)', () => {
  /** alice in Acme, with Mekari freed of example.com so Acme can convert to it. */
  function convertible() {
    const db = aliceInAcme();
    addExternalMember(db);
    Object.assign(db.workspaces.find((w) => w.name === 'Mekari')!, { isOrganization: false, domain: null });
    return db;
  }

  it('convert waits for the member list before saying who becomes a guest', async () => {
    const db = convertible();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    interceptApi(db, async (_method, path) => {
      if (path === '/api/v1/admin/users') await held;
      return undefined;
    });
    renderApp('/workspace/settings?tab=organization', { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Convert to organization' }));
    const dialog = await screen.findByRole('dialog', { name: /Convert to an organization/ });
    expect(within(dialog).getByText('Checking who would become a guest…')).toBeInTheDocument();
    expect(within(dialog).queryByText(/no roles change/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Convert' })).toBeDisabled();

    release();
    expect(await within(dialog).findByRole('list', { name: 'People who will become guests' })).toHaveTextContent('Zed Outsider');
    expect(within(dialog).getByRole('button', { name: 'Convert' })).toBeEnabled();
    expect(within(dialog).getByText(/Deactivated members and pending invites outside example\.com become guests too/)).toBeInTheDocument();
  });

  it('convert stays disabled if the member list fails to load', async () => {
    const db = convertible();
    interceptApi(db, (_method, path) => (path === '/api/v1/admin/users' ? fail500() : undefined));
    renderApp('/workspace/settings?tab=organization', { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Convert to organization' }));
    const dialog = await screen.findByRole('dialog', { name: /Convert to an organization/ });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Couldn’t load the member list/);
    expect(within(dialog).getByRole('button', { name: 'Convert' })).toBeDisabled();
    expect(db.workspaces.find((w) => w.name === 'Acme Pilot')!.isOrganization).toBe(false);
  });

  it('checks my own email is on the domain before confirming', async () => {
    const db = convertible();
    renderApp('/workspace/settings?tab=organization', { db });
    const u = user();
    const domain = await screen.findByRole('textbox', { name: 'Email domain' });
    await u.clear(domain);
    await u.type(domain, 'partner.test');
    await u.click(screen.getByRole('button', { name: 'Convert to organization' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your own email (alice@example.com) must be on partner.test');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(domain).toHaveAttribute('aria-invalid', 'true');
  });

  it('a role change refetches teams and projects too (W4/W7)', async () => {
    const db = aliceInAcme();
    const { queryClient } = renderApp('/workspace/settings?tab=members', { db });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    await user().selectOptions(await screen.findByRole('combobox', { name: 'Role for Bob Brown' }), 'GUEST');
    await waitFor(() => expect(membership(db, 'Acme Pilot', BOB).role).toBe('GUEST'));
    const keys = spy.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    for (const k of [['teams'], ['team'], ['projects'], ['project'], ['users'], ['adminUsers']]) expect(keys).toContain(JSON.stringify(k));
  });

  it('points a sole member to Delete instead of Leave', async () => {
    const db = setupMockApi(ALICE);
    const now = new Date().toISOString();
    db.workspaces.push({ id: 'wksp-solo', name: 'Solo Lab', isOrganization: false, domain: null, color: '#4186e0', createdAt: now });
    db.workspaceMembers.push({ workspaceId: 'wksp-solo', userId: userId(db, ALICE), role: 'ADMIN', isActive: true, joinedAt: now });
    db.users.find((u) => u.email === ALICE)!.lastWorkspaceId = 'wksp-solo';
    renderApp('/', { db });
    const u = user();
    await expectCurrent('Solo Lab');
    await u.click(within(mainNav()).getByRole('button', { name: 'Workspace menu' }));
    await u.click(screen.getByRole('menuitem', { name: 'Leave Solo Lab' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave Solo Lab?' });
    expect(within(dialog).queryByRole('button', { name: 'Leave workspace' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Go to Danger zone' })).toHaveAttribute('href', '/workspace/settings?tab=danger');
  });

  it('clears a stale leave error when the dialog reopens', async () => {
    const db = aliceInAcme();
    renderApp('/workspace/settings', { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Leave workspace' }));
    let dialog = await screen.findByRole('dialog', { name: 'Leave Acme Pilot?' });
    await u.click(within(dialog).getByRole('button', { name: 'Leave workspace' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await u.click(screen.getByRole('button', { name: 'Leave workspace' }));
    dialog = await screen.findByRole('dialog', { name: 'Leave Acme Pilot?' });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('after a delete, a failed /auth/me falls back to the lost-workspace reset', async () => {
    const db = aliceInAcme();
    let deleted = false;
    let failedOnce = false;
    interceptApi(db, (method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/v1/workspaces/')) deleted = true;
      if (deleted && !failedOnce && path === '/api/v1/auth/me') {
        failedOnce = true;
        return fail500();
      }
      return undefined;
    });
    renderApp('/workspace/settings?tab=danger', { db });
    const u = user();
    await u.type(await screen.findByRole('textbox', { name: /to confirm/ }), 'Acme Pilot');
    await u.click(screen.getByRole('button', { name: 'Delete workspace' }));
    await expectCurrent('Mekari');
    expect(failedOnce).toBe(true);
    expect(getWorkspaceId()).toBe(wsId(db, 'Mekari'));
  });
});
