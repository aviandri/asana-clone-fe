import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { authApi, workspacesApi } from '@/api/endpoints';
import type { InviteInfo } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/lib/errors';
import { useSwitchWorkspace } from '@/workspace/useWorkspace';
import { AuthLayout } from './AuthLayout';

/**
 * An invite for someone who already has an account (SPEC §12): "Log in to join X" → back here with
 * `?join=1` → `POST /me/invites/:id/accept` → switch into the workspace.
 */
function ExistingAccountInvite({ token, invite }: { token: string; invite: InviteInfo }) {
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const switchTo = useSwitchWorkspace();
  const ws = invite.workspace;
  const join = useMutation({
    mutationFn: () => workspacesApi.acceptInvite(invite.id),
    onSuccess: (w) => switchTo(w, { message: `Welcome to ${w.name}` }),
    meta: { quiet: true },
  });
  const sameEmail = !!user && user.email.toLowerCase() === invite.email.toLowerCase();
  // Coming back from login: join right away (once).
  const autoJoined = useRef(false);
  useEffect(() => {
    if (sameEmail && params.get('join') === '1' && !autoJoined.current) {
      autoJoined.current = true;
      join.mutate();
    }
  }, [sameEmail, params, join]);

  if (!user) {
    const next = `/invite/${encodeURIComponent(token)}?join=1`;
    return (
      <AuthLayout title={`Join ${ws.name} on Mekari Project`}>
        <p className="mb-4 text-sm text-gray-600">
          <strong>{invite.email}</strong> already has an account. Log in to join {ws.name}
          {invite.role === 'GUEST' ? ' as a guest' : ''}.
        </p>
        <Link to={`/login?next=${encodeURIComponent(next)}`} className="btn-primary w-full py-2">
          Log in to join {ws.name}
        </Link>
      </AuthLayout>
    );
  }
  if (!sameEmail) {
    return (
      <AuthLayout title="This invite is for someone else">
        <p className="mb-4 text-sm text-gray-600">
          This invite to {ws.name} is for <strong>{invite.email}</strong>, but you’re logged in as <strong>{user.email}</strong>.
        </p>
        <button type="button" className="btn-secondary w-full" onClick={() => void logout()}>
          Log out
        </button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={`Join ${ws.name}`}>
      <p className="mb-4 text-sm text-gray-600">
        You’ve been invited to {ws.name}
        {invite.role === 'GUEST' ? ' as a guest' : ''}.
      </p>
      {join.isError && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {errorMessage(join.error, 'Could not join')}
        </p>
      )}
      <button type="button" className="btn-primary w-full py-2" disabled={join.isPending} onClick={() => join.mutate()}>
        {join.isPending ? 'Joining…' : `Join ${ws.name}`}
      </button>
    </AuthLayout>
  );
}

export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => authApi.getInvite(token),
    retry: false,
  });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setSubmitting(true);
    try {
      await acceptInvite(token, name.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      // 409: the email got an account meanwhile — accepting is a logged-in action then.
      if (err instanceof ApiError && err.status === 409) setHasAccount(true);
      setError(errorMessage(err, 'Could not accept invite'));
      setSubmitting(false);
    }
  }

  if (invite.isLoading) {
    return (
      <AuthLayout title="Join your team on Mekari Project">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </AuthLayout>
    );
  }

  if (invite.isError) {
    const expired = invite.error instanceof ApiError && (invite.error.status === 410 || invite.error.code === 'GONE');
    return (
      <AuthLayout title={expired ? 'Invite no longer valid' : 'Invite not found'}>
        <p className="text-sm text-gray-600">
          {expired
            ? 'This invite link has expired or was already used. Ask an admin for a new one, or log in if you already set up your account.'
            : 'This invite link is invalid. Check that you copied the whole link.'}
        </p>
        <Link to="/login" className="btn-secondary mt-4 w-full">
          Go to login
        </Link>
      </AuthLayout>
    );
  }

  const info = invite.data!;
  if (info.existingUser) return <ExistingAccountInvite token={token} invite={info} />;

  return (
    <AuthLayout title={`Join ${info.workspace.name} on Mekari Project`}>
      <p className="mb-4 text-sm text-gray-600">
        You were invited to {info.workspace.name}
        {info.role === 'GUEST' ? ' as a guest' : ''} as <strong>{info.email}</strong>. Set up your account to continue.
      </p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="name" className="label">
            Full name
          </label>
          <input id="name" className="input" autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="input"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="confirm" className="label">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className="input"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
            {hasAccount && (
              <>
                {' '}
                <Link to={`/login?next=${encodeURIComponent(`/invite/${token}?join=1`)}`} className="font-medium underline">
                  Log in to join {info.workspace.name}
                </Link>
              </>
            )}
          </p>
        )}
        <button type="submit" className="btn-primary w-full py-2" disabled={submitting || !name.trim() || !password}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
