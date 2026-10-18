import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { setFetch } from '@/api/client';
import { createMockFetch } from '@/mocks/backend';
import { ADMIN, ALICE, renderApp, setupMockApi } from '@/test/utils';
import { getWorkspaceId, WORKSPACE_STORAGE_KEY } from './workspaceId';

const user = () => userEvent.setup();
const mainNav = () => screen.getByRole('navigation', { name: 'Main' });
const switcher = async () => within(await screen.findByRole('navigation', { name: 'Main' })).findByRole('button', { name: 'Workspace menu' });
/** The switcher (eventually) shows `name`; switching is async. */
const expectCurrent = (name: string) =>
  waitFor(() => expect(within(mainNav()).getByRole('button', { name: 'Workspace menu' })).toHaveTextContent(name));
/** A status toast containing `text` (the toast store outlives a test, so match by text). */
const expectToast = (text: string) =>
  waitFor(() => expect(screen.getAllByRole('status').map((t) => t.textContent).join('|')).toContain(text));

/** Seeded mock API that also records the X-Workspace-Id of every request. */
function recordingApi(loginAs: string) {
  const db = setupMockApi(loginAs);
  const seen: { path: string; ws: string | null }[] = [];
  const inner = createMockFetch(() => db);
  setFetch((input, init) => {
    seen.push({ path: new URL(input, 'http://x').pathname, ws: new Headers(init?.headers).get('X-Workspace-Id') });
    return inner(input, init);
  });
  const id = (name: string) => db.workspaces.find((w) => w.name === name)!.id;
  return { db, seen, id };
}

describe('workspace switching (SPEC §12, e2e selectors)', () => {
  it('switches from the sidebar menu: header, server switch, cache reset, toast', async () => {
    const { db, seen, id } = recordingApi(ALICE);
    const { router } = renderApp('/my-tasks', { db });
    const u = user();
    const button = await switcher();
    await expectCurrent('Mekari');
    expect(await within(mainNav()).findByRole('link', { name: 'Website Redesign' })).toBeInTheDocument();

    await u.click(button);
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: 'Mekari' })).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByRole('menuitemradio', { name: 'Acme Pilot' })).toHaveAttribute('aria-checked', 'false');
    expect(within(menu).getByRole('menuitem', { name: 'Create workspace' })).toBeInTheDocument();
    // alice is a MEMBER of Mekari: no settings entry.
    expect(within(menu).queryByRole('menuitem', { name: 'Workspace settings' })).not.toBeInTheDocument();
    seen.length = 0;
    await u.click(within(menu).getByRole('menuitemradio', { name: 'Acme Pilot' }));

    await expectToast('Switched to Acme Pilot');
    await expectCurrent('Acme Pilot');
    expect(await within(mainNav()).findByRole('link', { name: 'Pilot Rollout' })).toBeInTheDocument();
    expect(within(mainNav()).queryByRole('link', { name: 'Website Redesign' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');

    const acme = id('Acme Pilot');
    expect(db.users.find((x) => x.email === ALICE)!.lastWorkspaceId).toBe(acme);
    expect(getWorkspaceId()).toBe(acme);
    expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(acme);
    // Everything fetched after the switch carries the new workspace (except the rail's unread
    // probes, which name their own workspace).
    const after = seen.filter((r) => !r.path.endsWith('/switch') && r.path !== '/api/v1/notifications');
    expect(after.some((r) => r.path.endsWith('/projects'))).toBe(true);
    expect(after.filter((r) => r.ws !== acme)).toEqual([]);
  });

  it('shows the rail with ≥ 2 workspaces and switches with Ctrl+number', async () => {
    renderApp('/', { loginAs: ALICE });
    const rail = await screen.findByRole('navigation', { name: 'Workspaces' });
    // Me.workspaces is sorted by name: 1 = Acme Pilot, 2 = Mekari.
    expect(within(rail).getByRole('button', { name: 'Mekari' })).toHaveAttribute('aria-current', 'true');

    fireEvent.keyDown(document, { key: '1', ctrlKey: true });
    await expectCurrent('Acme Pilot');
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Workspaces' })).getByRole('button', { name: 'Acme Pilot' })).toHaveAttribute('aria-current', 'true'));

    await user().click(within(screen.getByRole('navigation', { name: 'Workspaces' })).getByRole('button', { name: 'Mekari' }));
    await expectCurrent('Mekari');
  });

  it('has no rail for a single-workspace user', async () => {
    renderApp('/', { loginAs: ADMIN });
    await expectCurrent('Mekari');
    expect(screen.queryByRole('navigation', { name: 'Workspaces' })).not.toBeInTheDocument();
  });

  it('follows a deep link into another workspace', async () => {
    const { db, id } = recordingApi(ALICE);
    const task = db.tasks.find((t) => t.title === 'Configure SSO')!;
    renderApp(`/projects/${task.projectId}/list?task=${task.id}`, { db });

    await expectToast('Switched to Acme Pilot to open this');
    expect(await screen.findByRole('dialog', { name: 'Configure SSO' })).toBeInTheDocument();
    await expectCurrent('Acme Pilot');
    expect(getWorkspaceId()).toBe(id('Acme Pilot'));
  });

  it('forgets a remembered workspace the user has left', async () => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, 'wksp-gone');
    const { db } = recordingApi(ALICE);
    // Re-seed the module state from storage, as a fresh tab would.
    const { resetWorkspaceId } = await import('./workspaceId');
    resetWorkspaceId();
    renderApp('/', { db });
    await expectCurrent('Mekari');
    expect(getWorkspaceId()).toBe(db.workspaces.find((w) => w.name === 'Mekari')!.id);
  });

  it('accepts a pending invite from the menu and switches into it', async () => {
    const db = setupMockApi(ADMIN);
    const acme = db.workspaces.find((w) => w.name === 'Acme Pilot')!;
    const alice = db.users.find((x) => x.email === ALICE)!;
    db.invites.push({
      id: 'inv-acme',
      workspaceId: acme.id,
      email: ADMIN,
      role: 'MEMBER',
      token: 'tok-acme',
      invitedById: alice.id,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      acceptedAt: null,
      createdAt: new Date().toISOString(),
    });
    renderApp('/', { db });
    const u = user();
    await u.click(await switcher());
    await u.click(await screen.findByRole('menuitem', { name: 'Accept invite to Acme Pilot' }));
    await expectToast('Welcome to Acme Pilot');
    await expectCurrent('Acme Pilot');
    expect(await screen.findByRole('navigation', { name: 'Workspaces' })).toBeInTheDocument();
  });
});

describe('onboarding (no workspace)', () => {
  it('lets a user with no workspace create one and enter the app', async () => {
    const db = setupMockApi(ADMIN);
    const admin = db.users.find((x) => x.email === ADMIN)!;
    db.workspaceMembers = db.workspaceMembers.filter((m) => m.userId !== admin.id);
    admin.lastWorkspaceId = null;
    renderApp('/', { db });
    const u = user();
    expect(await screen.findByRole('heading', { name: /welcome, ada/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();

    const card = screen.getByRole('region', { name: 'Create a workspace' });
    await u.type(within(card).getByRole('textbox', { name: 'Workspace name' }), 'Side Project');
    await act(() => u.click(within(card).getByRole('button', { name: 'Create workspace' })));
    await expectCurrent('Side Project');
    expect(db.workspaceMembers.find((m) => m.userId === admin.id)).toMatchObject({ role: 'ADMIN', isActive: true });
  });
});
