import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/useAuth';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/lib/errors';
import { AuthLayout } from './AuthLayout';

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

  return (
    <AuthLayout title="Join your team on Mekari Project">
      <p className="mb-4 text-sm text-gray-600">
        You were invited as <strong>{invite.data?.email}</strong>. Set up your account to continue.
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
          </p>
        )}
        <button type="submit" className="btn-primary w-full py-2" disabled={submitting || !name.trim() || !password}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
