import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { qk } from '@/api/queryKeys';
import type { Task } from '@/api/types';
import { useUpdateTask } from '@/tasks/useTaskMutations';
import { setFetch } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import { subscribeToasts } from '@/lib/toast';
import { createMockFetch } from '@/mocks/backend';
import { ADMIN, ALICE, createTestQueryClient, renderApp, setupMockApi } from '@/test/utils';
import { getWorkspaceId, setWorkspaceId, WORKSPACE_STORAGE_KEY } from './workspaceId';

const user = () => userEvent.setup();
const mainNav = () => screen.getByRole('navigation', { name: 'Main' });
const switcher = async () => within(await screen.findByRole('navigation', { name: 'Main' })).findByRole('button', { name: 'Workspace menu' });
/** The switcher (eventually) shows `name`; switching is async. */
const expectCurrent = (name: string) =>
  waitFor(() => expect(within(mainNav()).getByRole('button', { name: 'Workspace menu' })).toHaveTextContent(name));
/** A status toast containing `text` (the toast store outlives a test, so match by text). */
const expectToast = (text: string) =>
  waitFor(() => expect(screen.getAllByRole('status').map((t) => t.textContent).join('|')).toContain(text));

type Hold = (req: { method: string; path: string; ws: string | null }) => Promise<void> | undefined;

/** Seeded mock API that records the X-Workspace-Id of every request; `hold` can delay one. */
function recordingApi(loginAs: string, hold?: Hold) {
  const db = setupMockApi(loginAs);
  const seen: { method: string; path: string; ws: string | null }[] = [];
  const inner = createMockFetch(() => db);
  setFetch(async (input, init) => {
    const req = { method: init?.method ?? 'GET', path: new URL(input, 'http://x').pathname, ws: new Headers(init?.headers).get('X-Workspace-Id') };
    seen.push(req);
    await hold?.(req);
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

/** A promise plus its resolver, to hold a mock response until the test says so. */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
}

describe('workspace switching edge cases (review fixes)', () => {
  it('overlapping switches: only the newest commits, header and cache agree', async () => {
    const slow = gate();
    let acmeId = '';
    const { db, id } = recordingApi(ALICE, ({ path, ws }) => (path === '/api/v1/auth/me' && ws === acmeId ? slow.promise : undefined));
    acmeId = id('Acme Pilot');
    // A third workspace for alice, so Ctrl+3 exists.
    const alice = db.users.find((x) => x.email === ALICE)!;
    db.workspaces.push({ id: 'wksp-zeta', name: 'Zeta Lab', isOrganization: false, domain: null, color: '#4186e0', createdAt: new Date().toISOString() });
    db.workspaceMembers.push({ workspaceId: 'wksp-zeta', userId: alice.id, role: 'MEMBER', isActive: true, joinedAt: new Date().toISOString() });
    renderApp('/', { db });
    await expectCurrent('Mekari');

    fireEvent.keyDown(document, { key: '1', ctrlKey: true }); // Acme Pilot: its /auth/me hangs
    await waitFor(() => expect(alice.lastWorkspaceId).toBe(acmeId));
    fireEvent.keyDown(document, { key: '3', ctrlKey: true }); // Zeta Lab, queued behind it
    slow.open();

    await expectCurrent('Zeta Lab');
    await expectToast('Switched to Zeta Lab');
    expect(screen.getAllByRole('status').map((t) => t.textContent).join('|')).not.toContain('Switched to Acme Pilot');
    expect(getWorkspaceId()).toBe('wksp-zeta');
    expect(alice.lastWorkspaceId).toBe('wksp-zeta');
  });

  it('a task panel on a project page from another workspace offers to switch instead of bouncing', async () => {
    const { db, seen, id } = recordingApi(ALICE);
    const mekariProject = db.projects.find((p) => p.name === 'Website Redesign')!;
    const acmeTask = db.tasks.find((t) => t.title === 'Configure SSO')!;
    const { router } = renderApp(`/projects/${mekariProject.id}/list?task=${acmeTask.id}`, { db });
    const u = user();

    expect(await screen.findByText('This task is in another workspace, Acme Pilot.')).toBeInTheDocument();
    await expectCurrent('Mekari');
    expect(seen.filter((r) => r.path.endsWith('/switch'))).toEqual([]);

    await u.click(screen.getByRole('button', { name: 'Open in Acme Pilot' }));
    await expectToast('Switched to Acme Pilot to open this task');
    expect(await screen.findByRole('dialog', { name: 'Configure SSO' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/my-tasks');
    expect(getWorkspaceId()).toBe(id('Acme Pilot'));
  });

  it('the page wins over its task panel, and switches at most once', async () => {
    const { db, seen, id } = recordingApi(ALICE);
    db.users.find((x) => x.email === ALICE)!.lastWorkspaceId = id('Acme Pilot');
    const mekariProject = db.projects.find((p) => p.name === 'Website Redesign')!;
    const acmeTask = db.tasks.find((t) => t.title === 'Configure SSO')!;
    renderApp(`/projects/${mekariProject.id}/list?task=${acmeTask.id}`, { db });

    await expectToast('Switched to Mekari to open this project');
    expect(await screen.findByText('This task is in another workspace, Acme Pilot.')).toBeInTheDocument();
    await expectCurrent('Mekari');
    // Give any (wrong) bounce a chance to fire.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(seen.filter((r) => r.path.endsWith('/switch')).length).toBe(1);
  });

  it('recovers when access to the current workspace is lost mid-session', async () => {
    const { db, id } = recordingApi(ALICE);
    const alice = db.users.find((x) => x.email === ALICE)!;
    alice.lastWorkspaceId = id('Acme Pilot');
    const { queryClient, router } = renderApp('/my-tasks', { db });
    await expectCurrent('Acme Pilot');

    // An Acme admin deactivates alice there.
    db.workspaceMembers.find((m) => m.workspaceId === id('Acme Pilot') && m.userId === alice.id)!.isActive = false;
    await act(() => queryClient.invalidateQueries());

    await expectToast('You no longer have access to Acme Pilot');
    await expectCurrent('Mekari');
    expect(getWorkspaceId()).toBe(id('Mekari'));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('navigation', { name: 'Workspaces' })).not.toBeInTheDocument();
  });

  it('an ID-addressed 404 (e.g. /admin/users/:id) is not treated as lost access', async () => {
    const { db, seen, id } = recordingApi(ALICE);
    db.users.find((x) => x.email === ALICE)!.lastWorkspaceId = id('Acme Pilot');
    const { router } = renderApp('/my-tasks', { db });
    await expectCurrent('Acme Pilot');
    const meCalls = () => seen.filter((r) => r.path === '/api/v1/auth/me').length;
    const before = meCalls();

    await act(() => adminApi.updateUser('user-missing', { role: 'MEMBER' }).catch(() => undefined));
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(meCalls()).toBe(before);
    expect(router.state.location.pathname).toBe('/my-tasks');
  });

  it('a scoped 404 while still a member is a no-op: no navigation, no toast', async () => {
    const { db, seen, id } = recordingApi(ALICE);
    db.users.find((x) => x.email === ALICE)!.lastWorkspaceId = id('Acme Pilot');
    const inner = createMockFetch(() => db);
    let flaky = false;
    setFetch(async (input, init) => {
      const path = new URL(input, 'http://x').pathname;
      seen.push({ method: init?.method ?? 'GET', path, ws: new Headers(init?.headers).get('X-Workspace-Id') });
      if (flaky && path === '/api/v1/projects') {
        flaky = false;
        return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }), { status: 404 });
      }
      return inner(input, init);
    });
    const { queryClient, router } = renderApp('/my-tasks', { db });
    await expectCurrent('Acme Pilot');
    const meCalls = () => seen.filter((r) => r.path === '/api/v1/auth/me').length;
    const before = meCalls();

    const toasts: string[] = [];
    const unsubscribe = subscribeToasts((list) => list.forEach((t) => toasts.push(t.message)));
    toasts.length = 0; // subscribing replays the current ones
    flaky = true;
    await act(() => queryClient.invalidateQueries({ queryKey: ['projects'] }));
    await waitFor(() => expect(meCalls()).toBe(before + 1)); // it did check
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(router.state.location.pathname).toBe('/my-tasks');
    await expectCurrent('Acme Pilot');
    expect(getWorkspaceId()).toBe(id('Acme Pilot'));
    unsubscribe();
    expect(toasts.filter((m) => m.includes('no longer have access'))).toEqual([]);
  });

  it('a late task-update failure does not roll back into the next workspace', async () => {
    const fail = gate();
    const db = setupMockApi(ALICE);
    const inner = createMockFetch(() => db);
    setFetch(async (input, init) => {
      if (init?.method === 'PATCH') {
        await fail.promise;
        return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }), { status: 500 });
      }
      return inner(input, init);
    });
    const qc = createTestQueryClient();
    const mine = { id: 'task-a', title: 'Mekari task', completed: false } as Task;
    qc.setQueryData(qk.myTasks, [mine]);
    setWorkspaceId('wksp-a');
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    act(() => result.current.mutate({ id: 'task-a', patch: { completed: true }, quiet: true }));
    await waitFor(() => expect(qc.getQueryData<Task[]>(qk.myTasks)?.[0].completed).toBe(true));
    // Switch: the cache now belongs to workspace B.
    setWorkspaceId('wksp-b');
    const theirs = [{ id: 'task-b', title: 'Acme task', completed: false } as Task];
    qc.setQueryData(qk.myTasks, theirs);
    fail.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(qk.myTasks)).toEqual(theirs);
  });

  it('logging out forgets the workspace id', async () => {
    const { db, id } = recordingApi(ALICE);
    renderApp('/', { db });
    await expectCurrent('Mekari');
    expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(id('Mekari'));
    await user().click(within(mainNav()).getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(getWorkspaceId()).toBeNull();
    expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();
  });
});
