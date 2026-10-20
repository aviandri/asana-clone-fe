import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '@/api/client';
import { createMockFetch } from '@/mocks/backend';
import type { TaskRow } from '@/mocks/db';
import { ADMIN, ALICE, BOB, renderApp, setupMockApi } from '@/test/utils';
import { claudeCodeCommands } from './tokens';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const user = () => userEvent.setup();

async function openTokens(loginAs = ADMIN, prepare?: (db: ReturnType<typeof setupMockApi>) => void) {
  const db = setupMockApi(loginAs);
  db.config = { appUrl: 'https://project.example.com' };
  prepare?.(db);
  const utils = renderApp('/settings/tokens', { db });
  await screen.findByRole('heading', { name: 'API tokens & connected apps' });
  const list = () => screen.getByRole('region', { name: 'Tokens and apps' });
  return { ...utils, list };
}

describe('API tokens & connected apps', () => {
  it('shows the MCP URL and the connected apps', async () => {
    const { list } = await openTokens();
    expect(await screen.findByRole('textbox', { name: 'MCP server URL' })).toHaveValue('https://project.example.com/mcp');
    const row = (await within(list()).findByText('Claude')).closest('li')!;
    expect(within(row).getByText('Connected app')).toBeInTheDocument();
    expect(within(row).getByText('Read & write')).toBeInTheDocument();
    expect(within(row).getByText('mpoa_Qx7Lm2v…')).toBeInTheDocument();
  });

  it('creates a token, shows it once with setup commands, and lists it', async () => {
    const { db, list } = await openTokens();
    // user-event installs a clipboard stub of its own.
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Create token' }));
    const dialog = screen.getByRole('dialog', { name: 'Create token' });
    await u.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Claude Code laptop');
    await u.click(within(dialog).getByRole('radio', { name: /Read only/ }));
    await u.selectOptions(within(dialog).getByRole('combobox', { name: 'Expires after' }), '30');
    await u.click(within(dialog).getByRole('button', { name: 'Create token' }));

    const done = await screen.findByRole('dialog', { name: 'Token created' });
    const token = (within(done).getByRole('textbox', { name: 'Token' }) as HTMLInputElement).value;
    expect(token).toMatch(/^mpat_[A-Za-z0-9_-]{43}$/);
    const row = db.apiTokens!.find((t) => t.name === 'Claude Code laptop')!;
    expect(row.scope).toBe('READ');
    expect(new Date(row.expiresAt!).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    const cmd = claudeCodeCommands('https://project.example.com/mcp', token);
    expect(within(done).getByLabelText('Claude Code command')).toHaveTextContent(cmd.inline);
    expect(within(done).getByLabelText('Claude Code command using an environment variable')).toHaveTextContent(
      'claude mcp add --transport http mekari-project https://project.example.com/mcp --header "Authorization: Bearer $MEKARI_PROJECT_TOKEN"',
    );
    await u.click(within(done).getByRole('button', { name: 'Copy token' }));
    expect(await navigator.clipboard.readText()).toBe(token);
    expect(within(done).getByRole('button', { name: 'Copy token' })).toHaveTextContent('Copied');

    await u.click(within(done).getByRole('button', { name: 'Done' }));
    const listed = (await within(list()).findByText('Claude Code laptop')).closest('li')!;
    expect(within(listed).getByText('Personal token')).toBeInTheDocument();
    expect(within(listed).getByText('Read only')).toBeInTheDocument();
    expect(within(listed).getByText('Never used')).toBeInTheDocument();
    // The plaintext is gone for good.
    expect(screen.queryByDisplayValue(token)).toBeNull();
    expect(document.body.textContent).not.toContain(token);
  });

  it('keeps the shown-once token out of the query cache, and only Done closes it', async () => {
    const { queryClient, list } = await openTokens();
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Create token' }));
    await u.type(within(screen.getByRole('dialog', { name: 'Create token' })).getByRole('textbox', { name: 'Name' }), 'cli');
    await u.click(within(screen.getByRole('dialog', { name: 'Create token' })).getByRole('button', { name: 'Create token' }));
    const done = await screen.findByRole('dialog', { name: 'Token created' });
    const field = within(done).getByRole('textbox', { name: 'Token' }) as HTMLInputElement;
    // Focus moves to the token (the form that had it is gone).
    await waitFor(() => expect(field).toHaveFocus());
    const leaked = () => queryClient.getMutationCache().getAll().filter((m) => JSON.stringify(m.state.data ?? null).includes(field.value));
    await waitFor(() => expect(leaked()).toEqual([]));

    // Escape, the backdrop and a close button don't lose it before it's copied.
    await u.keyboard('{Escape}');
    fireEvent.mouseDown(done.parentElement!);
    expect(screen.getByRole('dialog', { name: 'Token created' })).toBeInTheDocument();
    expect(within(done).queryByRole('button', { name: 'Close' })).toBeNull();

    await u.click(within(done).getByRole('button', { name: 'Done' }));
    await within(list()).findByText('cli');
    expect(leaked()).toEqual([]);
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(field.value);
  });

  it('can’t be cancelled or closed while the token is being created', async () => {
    const { db } = await openTokens();
    const base = createMockFetch(() => db);
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    setFetch(async (input, init) => {
      if (init?.method === 'POST' && input.endsWith('/me/tokens')) await held;
      return base(input, init);
    });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Create token' }));
    const dialog = screen.getByRole('dialog', { name: 'Create token' });
    await u.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'slow');
    await u.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    await u.keyboard('{Escape}');
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.getByRole('dialog', { name: 'Create token' })).toBeInTheDocument();

    await act(async () => release());
    expect(await screen.findByRole('dialog', { name: 'Token created' })).toBeInTheDocument();
  });

  it('shows the server’s message when the token limit is reached', async () => {
    const { db } = await openTokens(ADMIN, (d) => {
      const me = d.users.find((x) => x.email === ADMIN)!;
      for (let i = 0; i < 20; i++) {
        d.apiTokens!.push({
          id: `tokn${i}`, userId: me.id, name: `t${i}`, source: 'PAT', scope: 'READ', prefix: 'mpat_aaaaaaa',
          createdAt: new Date().toISOString(), lastUsedAt: null, expiresAt: null, revokedAt: null,
        });
      }
    });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Create token' }));
    const dialog = screen.getByRole('dialog', { name: 'Create token' });
    await u.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'one more');
    await u.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You can have up to 20 active tokens');
    expect(db.apiTokens!.some((t) => t.name === 'one more')).toBe(false);
  });

  it('revokes a token and disconnects an app after confirming', async () => {
    const { db, list } = await openTokens();
    const u = user();
    await u.click(await within(list()).findByRole('button', { name: 'Revoke Claude' }));
    const confirm = screen.getByRole('dialog', { name: 'Disconnect Claude?' });
    await u.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(db.apiTokens![0].revokedAt).toBeNull();

    await u.click(within(list()).getByRole('button', { name: 'Revoke Claude' }));
    await u.click(within(screen.getByRole('dialog', { name: 'Disconnect Claude?' })).getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(within(list()).queryByText('Claude')).toBeNull());
    expect(db.apiTokens![0].revokedAt).not.toBeNull();
    expect(within(list()).getByText('No tokens or connected apps yet.')).toBeInTheDocument();
  });

  it('without MCP: no create or setup, but existing rows can still be revoked', async () => {
    const { list } = await openTokens(ADMIN, (d) => (d.config = { appUrl: 'https://project.example.com', mcpEnabled: false }));
    expect(await screen.findByText(/Connecting Claude isn’t enabled on this server/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create token' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'MCP server URL' })).toBeNull();
    expect(await within(list()).findByRole('button', { name: 'Revoke Claude' })).toBeEnabled();
  });

  it('is reachable from the profile, which says a new password revokes tokens', async () => {
    setupMockApi(ADMIN);
    const { router } = renderApp('/my-tasks', { loginAs: ADMIN });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'My profile' }));
    const profile = screen.getByRole('dialog', { name: 'My profile' });
    expect(within(profile).getByText(/also revokes your API tokens/)).toBeInTheDocument();
    await u.click(within(profile).getByRole('link', { name: /API tokens & connected apps/ }));
    expect(router.state.location.pathname).toBe('/settings/tokens');
    expect(screen.queryByRole('dialog', { name: 'My profile' })).toBeNull();
  });

  it('a new password revokes every token (mock parity with the server)', async () => {
    const { list } = await openTokens();
    await within(list()).findByText('Claude');
    const u = user();
    await u.click(screen.getByRole('button', { name: 'My profile' }));
    const profile = screen.getByRole('dialog', { name: 'My profile' });
    await u.type(within(profile).getByLabelText('Current password'), 'password123');
    await u.type(within(profile).getByLabelText('New password'), 'new-password-1');
    await u.click(within(profile).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(list()).queryByText('Claude')).toBeNull());
  });
});

/** §14 M6: MCP deep links. A personal task opens from /my-tasks for anyone who can see it. */
describe('MCP deep links', () => {
  function personalTask(db: ReturnType<typeof setupMockApi>, patch: Partial<TaskRow>): TaskRow {
    const template = db.tasks.find((t) => t.projectId !== null)!;
    const now = new Date().toISOString();
    const t: TaskRow = {
      ...template,
      id: `task-personal-${db.tasks.length}`,
      projectId: null,
      sectionId: null,
      parentId: null,
      title: 'Personal follow-up',
      description: null,
      assigneeId: null,
      dueDate: null,
      startDate: null,
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      ...patch,
    };
    db.tasks.push(t);
    return t;
  }

  const sharedWorkspace = (db: ReturnType<typeof setupMockApi>) => {
    const [alice, bob] = [ALICE, BOB].map((e) => db.users.find((u) => u.email === e)!);
    const ws = db.workspaces.find((w) =>
      [alice, bob].every((u) => db.workspaceMembers.some((m) => m.workspaceId === w.id && m.userId === u.id)),
    )!;
    return { alice, bob, ws };
  };

  it('opens a personal task the caller follows but isn’t assigned to', async () => {
    const db = setupMockApi(ALICE);
    const { alice, bob, ws } = sharedWorkspace(db);
    const t = personalTask(db, { workspaceId: ws.id, creatorId: bob.id, assigneeId: bob.id });
    db.followers.push({ taskId: t.id, userId: alice.id });
    renderApp(`/my-tasks?task=${t.id}&workspace=${ws.id}`, { db });
    expect(await screen.findByRole('dialog', { name: 'Personal follow-up' })).toBeInTheDocument();
  });

  it('opens a personal task the caller created for someone else', async () => {
    const db = setupMockApi(ALICE);
    const { alice, bob, ws } = sharedWorkspace(db);
    const t = personalTask(db, { workspaceId: ws.id, creatorId: alice.id, assigneeId: bob.id });
    const { router } = renderApp(`/my-tasks?task=${t.id}&workspace=${ws.id}`, { db });
    expect(await screen.findByRole('dialog', { name: 'Personal follow-up' })).toBeInTheDocument();
    // The workspace param is applied and stripped; the task param stays.
    expect(router.state.location.search).toBe(`?task=${t.id}`);
  });

  it('opens a project task from its MCP url, workspace param included', async () => {
    const db = setupMockApi(ALICE);
    const t = db.tasks.find((x) => x.projectId && !x.parentId && x.title === 'Build responsive header')!;
    renderApp(`/projects/${t.projectId}/list?task=${t.id}&workspace=${t.workspaceId}`, { db });
    expect(await screen.findByRole('dialog', { name: 'Build responsive header' })).toBeInTheDocument();
  });
});
