import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setFetch } from '@/api/client';
import { subscribeToasts } from '@/lib/toast';
import { createMockFetch } from '@/mocks/backend';
import { ALICE, renderApp, setupMockApi } from '@/test/utils';
import { getWorkspaceId } from './workspaceId';

// `?workspace=<id>` on any app URL (links from the Mac app, SPEC-MAC §5).
const expectCurrent = (name: string) =>
  waitFor(() =>
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Workspace menu' })).toHaveTextContent(name),
  );

/** alice (current: Mekari), recording /switch calls and every toast shown during the test. */
function setup() {
  const db = setupMockApi(ALICE);
  const switches: string[] = [];
  const inner = createMockFetch(() => db);
  setFetch((input, init) => {
    const path = new URL(input, 'http://x').pathname;
    if (path.endsWith('/switch')) switches.push(path);
    return inner(input, init);
  });
  const toasts: string[] = [];
  const unsubscribe = subscribeToasts((list) => list.forEach((t) => toasts.push(t.message)));
  toasts.length = 0; // subscribing replays the current ones
  cleanups.push(unsubscribe);
  const id = (name: string) => db.workspaces.find((w) => w.name === name)!.id;
  return { db, switches, toasts, id };
}
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((f) => f()));

describe('?workspace= links', () => {
  it('switches silently to a member workspace and strips the param', async () => {
    const { db, switches, toasts, id } = setup();
    const { router } = renderApp(`/my-tasks?workspace=${id('Acme Pilot')}`, { db });
    await expectCurrent('Acme Pilot');
    expect(router.state.location.pathname).toBe('/my-tasks');
    expect(router.state.location.search).toBe('');
    expect(switches).toHaveLength(1);
    expect(getWorkspaceId()).toBe(id('Acme Pilot'));
    expect(db.users.find((u) => u.email === ALICE)!.lastWorkspaceId).toBe(id('Acme Pilot'));
    expect(toasts.filter((m) => m.startsWith('Switched to'))).toEqual([]);
  });

  it('keeps other params and opens the linked task in that workspace without a deep-link toast', async () => {
    const { db, switches, toasts, id } = setup();
    const task = db.tasks.find((t) => t.title === 'Configure SSO')!;
    const { router } = renderApp(`/projects/${task.projectId}/list?workspace=${id('Acme Pilot')}&task=${task.id}`, { db });
    expect(await screen.findByRole('dialog', { name: 'Configure SSO' })).toBeInTheDocument();
    await expectCurrent('Acme Pilot');
    expect(router.state.location.search).toBe(`?task=${task.id}`);
    expect(switches).toHaveLength(1);
    expect(toasts.filter((m) => m.startsWith('Switched to'))).toEqual([]);
  });

  it('ignores a workspace I am not a member of', async () => {
    const { db, switches, toasts } = setup();
    const { router } = renderApp('/my-tasks?workspace=wksp-not-mine', { db });
    await expectCurrent('Mekari');
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.pathname).toBe('/my-tasks');
    expect(switches).toEqual([]);
    expect(toasts).toEqual([]);
  });

  it('does nothing but strip the param for the current workspace', async () => {
    const { db, switches, id } = setup();
    const { router } = renderApp(`/?workspace=${id('Mekari')}`, { db });
    await expectCurrent('Mekari');
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(switches).toEqual([]);
  });
});
