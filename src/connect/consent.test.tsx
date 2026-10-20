import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '@/api/client';
import { createMockFetch } from '@/mocks/backend';
import { ADMIN, BOB, renderApp, setupMockApi } from '@/test/utils';
import { leave } from './leave';

let left: ReturnType<typeof vi.fn>;
beforeEach(() => {
  left = vi.fn();
  vi.spyOn(leave, 'to').mockImplementation(left);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const user = () => userEvent.setup();
const CLAUDE = '/connect/authorize?request=demo-claude';

/** `loginAs: null` starts signed out. */
async function openConsent(path = CLAUDE, loginAs: string | null = ADMIN, prepare?: (db: ReturnType<typeof setupMockApi>) => void) {
  const db = setupMockApi(loginAs ?? undefined);
  prepare?.(db);
  const utils = renderApp(path, { db });
  return { ...utils, db };
}

describe('OAuth consent page', () => {
  it('sends a signed-out user to log in, then back to the request', async () => {
    const { router } = await openConsent(CLAUDE, null);
    await screen.findByRole('heading', { name: 'Log in to Mekari Project' });
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent(CLAUDE)}`);
    const u = user();
    await u.type(screen.getByLabelText('Email address'), BOB);
    await u.type(screen.getByLabelText('Password'), 'password123');
    await u.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('heading', { name: 'Connect Claude' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Signed in as' })).getByText(BOB)).toBeInTheDocument();
  });

  it('shows who is asking, where it goes back to, and as whom', async () => {
    const { db } = await openConsent();
    await screen.findByRole('heading', { name: 'Connect Claude' });
    expect(screen.getByText(/Identified by/)).toHaveTextContent('Identified by claude.ai');
    expect(screen.getByText(/You’ll go back to/)).toHaveTextContent('You’ll go back to claude.ai afterwards.');
    expect(screen.queryByRole('note')).toBeNull();
    const me = within(screen.getByRole('region', { name: 'Signed in as' }));
    expect(me.getByText('Ada Admin')).toBeInTheDocument();
    const can = screen.getByRole('region', { name: 'What it can do' });
    expect(can).toHaveTextContent('Create and update tasks');
    expect(can).toHaveTextContent('Never delete');
    const admin = db.users.find((u) => u.email === ADMIN)!;
    const mine = db.workspaces.filter((w) => db.workspaceMembers.some((m) => m.workspaceId === w.id && m.userId === admin.id));
    for (const w of mine) expect(can).toHaveTextContent(w.name);
  });

  it('allows with full access, and goes to the returned redirect', async () => {
    const { db } = await openConsent();
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(left).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=mock_code_demo-claude&state=demo'));
    expect(screen.getByRole('status')).toHaveTextContent('Taking you back to claude.ai…');
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
    expect(db.apiTokens!.at(-1)).toMatchObject({ source: 'OAUTH', name: 'Claude', scope: 'WRITE' });
  });

  it('can downgrade to read only', async () => {
    const { db } = await openConsent();
    const u = user();
    await u.click(await screen.findByRole('checkbox', { name: /Read only/ }));
    expect(screen.getByRole('region', { name: 'What it can do' })).not.toHaveTextContent('Create and update');
    await u.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(left).toHaveBeenCalled());
    expect(db.apiTokens!.at(-1)).toMatchObject({ source: 'OAUTH', scope: 'READ' });
  });

  it('cancels with access_denied', async () => {
    const { db } = await openConsent();
    const before = db.apiTokens!.length;
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(left).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?error=access_denied&state=demo'));
    expect(db.apiTokens!.length).toBe(before);
  });

  it('warns about a local app, and offers only read access when that’s all it asked for', async () => {
    const { db } = await openConsent('/connect/authorize?request=demo-local');
    await screen.findByRole('heading', { name: 'Connect Claude Code' });
    expect(screen.getByRole('note')).toHaveTextContent('This is a local app on this computer');
    expect(screen.getByText(/You’ll go back to/)).toHaveTextContent('localhost:53682');
    expect(screen.queryByText(/Identified by/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Read only/ })).toBeNull();
    expect(screen.getByText('Claude Code asked for read-only access.')).toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(left).toHaveBeenCalledWith('http://localhost:53682/callback?code=mock_code_demo-local&state=demo'));
    expect(db.apiTokens!.at(-1)).toMatchObject({ scope: 'READ' });
  });

  it.each([
    ['expired (410)', (db: ReturnType<typeof setupMockApi>) => (db.oauthRequests![0].expiresAt = new Date(Date.now() - 1000).toISOString()), 'This request has expired'],
    ['already decided (409)', (db: ReturnType<typeof setupMockApi>) => (db.oauthRequests![0].decidedAt = new Date().toISOString()), 'This request was already answered'],
    ['unknown (404)', (db: ReturnType<typeof setupMockApi>) => (db.oauthRequests = []), 'This link isn’t valid'],
  ])('explains a request that is %s on the first load', async (_name, prepare, title) => {
    await openConsent(CLAUDE, ADMIN, prepare);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
  });

  it('explains a missing request id', async () => {
    await openConsent('/connect/authorize');
    expect(await screen.findByRole('heading', { name: 'This link isn’t valid' })).toBeInTheDocument();
  });

  it('turns into the expired message when the request runs out while open', async () => {
    await openConsent(CLAUDE, ADMIN, (db) => (db.oauthRequests![0].expiresAt = new Date(Date.now() + 300).toISOString()));
    await screen.findByRole('button', { name: 'Allow' });
    expect(await screen.findByRole('heading', { name: 'This request has expired' }, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
  });

  it('says so when someone else answered it first (409)', async () => {
    const { db } = await openConsent();
    await screen.findByRole('button', { name: 'Allow' });
    db.oauthRequests![0].decidedAt = new Date().toISOString();
    await user().click(screen.getByRole('button', { name: 'Allow' }));
    expect(await screen.findByRole('heading', { name: 'This request was already answered' })).toBeInTheDocument();
    expect(left).not.toHaveBeenCalled();
  });

  it('never follows a redirect that isn’t http(s)', async () => {
    const { db } = await openConsent();
    const base = createMockFetch(() => db);
    setFetch(async (input, init) => {
      if (init?.method === 'POST' && input.endsWith('/decision'))
        return new Response(JSON.stringify({ redirectUrl: 'javascript:alert(1)' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return base(input, init);
    });
    await user().click(await screen.findByRole('button', { name: 'Allow' }));
    // Not stuck on "Taking you back…": it says what happened.
    expect(await screen.findByRole('heading', { name: 'Couldn’t go back to the app' })).toBeInTheDocument();
    expect(screen.queryByText(/Taking you back/)).toBeNull();
    expect(left).not.toHaveBeenCalled();
  });

  it('shows no buttons inside a frame', async () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    const { db } = await openConsent();
    expect(await screen.findByRole('heading', { name: 'Open this page directly' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    expect(db.oauthRequests![0].decidedAt).toBeNull();
  });

  it('works for a user with no workspace yet (M8)', async () => {
    await openConsent(CLAUDE, BOB, (db) => {
      const bob = db.users.find((u) => u.email === BOB)!;
      db.workspaceMembers = db.workspaceMembers.filter((m) => m.userId !== bob.id);
    });
    expect(await screen.findByRole('heading', { name: 'Connect Claude' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'What it can do' })).toHaveTextContent('In every workspace you join');
  });

  it('“Not you?” signs out and comes back here after logging in', async () => {
    const { router } = await openConsent();
    await user().click(await screen.findByRole('button', { name: 'Not you?' }));
    await screen.findByRole('heading', { name: 'Log in to Mekari Project' });
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent(CLAUDE)}`);
  });
});
