import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ALICE, ADMIN, renderApp, setupMockApi } from '@/test/utils';

describe('auth flow', () => {
  it('redirects anonymous users to /login and back after logging in', async () => {
    const { router } = renderApp('/my-tasks');
    await screen.findByRole('heading', { name: /log in/i });
    expect(router.state.location.pathname).toBe('/login');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), ADMIN);
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/my-tasks'));
  });

  it('shows an error for bad credentials', async () => {
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/email/i), ADMIN);
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i);
  });

  it('ignores off-site ?next= redirects', async () => {
    const { router } = renderApp('/login?next=//evil.example.com');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/email/i), ADMIN);
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('accepts an invite and lands in the app', async () => {
    const db = setupMockApi();
    db.invites.push({
      id: 'inv1',
      email: 'newbie@example.com',
      role: 'MEMBER',
      token: 'tok123',
      invitedById: db.users[0].id,
      expiresAt: new Date(Date.now() + 864e5).toISOString(),
      acceptedAt: null,
      createdAt: new Date().toISOString(),
    });
    const { router } = renderApp('/invite/tok123', { db });
    expect(await screen.findByText('newbie@example.com')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), 'New Bie');
    await user.type(screen.getByLabelText(/^password/i), 'secret123');
    await user.type(screen.getByLabelText(/confirm/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByText(/, New/)).toBeInTheDocument();
  });

  it('shows a friendly message for an unknown invite', async () => {
    renderApp('/invite/does-not-exist');
    expect(await screen.findByRole('heading', { name: /invite not found/i })).toBeInTheDocument();
  });

  it('logs out from the sidebar', async () => {
    const { router } = renderApp('/', { loginAs: ALICE });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /log out/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('app shell', () => {
  it('lists teams with their visible projects and hides Admin for members', async () => {
    renderApp('/', { loginAs: ALICE });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByText('Website Redesign')).toBeInTheDocument();
    expect(within(nav).getByText('Engineering')).toBeInTheDocument();
    expect(within(nav).queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows Admin and the unread inbox badge for admins', async () => {
    renderApp('/', { loginAs: ADMIN });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Admin')).toBeInTheDocument();
    expect(await within(nav).findByLabelText('2 unread')).toBeInTheDocument();
  });

  it('redirects members away from /admin', async () => {
    const { router } = renderApp('/admin', { loginAs: ALICE });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('login rate limiting', () => {
  it('shows a friendly message on 429 RATE_LIMITED', async () => {
    const db = setupMockApi();
    db.loginFailures = { [ADMIN]: 99 };
    renderApp('/login', { db });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/email/i), ADMIN);
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });
});
