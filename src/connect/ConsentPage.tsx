import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { oauthApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { OAuthConsentRequest, OAuthDecision } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/lib/errors';
import { AuthLayout } from '@/pages/AuthLayout';
import { ROLE_LABEL } from '@/workspace/settings/roles';
import { isFramed, isSafeRedirect, leave } from './leave';

type Gone = 'expired' | 'decided' | 'invalid';

const GONE_COPY: Record<Gone, { title: string; body: string }> = {
  expired: {
    title: 'This request has expired',
    body: 'Connection requests are valid for 10 minutes. Go back to the app you were connecting and try again.',
  },
  decided: {
    title: 'This request was already answered',
    body: 'Go back to the app you were connecting. If it isn’t connected, start again from there.',
  },
  invalid: {
    title: 'This link isn’t valid',
    body: 'Start connecting again from the app you want to use with Mekari Project.',
  },
};

function goneFrom(err: unknown): Gone | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 410) return 'expired';
  if (err.status === 409) return 'decided';
  if (err.status === 404) return 'invalid';
  return null;
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AuthLayout title={title}>
      <p role="status" className="text-sm text-gray-600">
        {children}
      </p>
    </AuthLayout>
  );
}

/** Flips to true at `iso` (the request's expiry), so a page left open doesn't offer a dead Allow. */
function useExpired(iso: string | undefined) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!iso) return;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return setExpired(true);
    const t = setTimeout(() => setExpired(true), Math.min(ms, 2_147_483_647));
    return () => clearTimeout(t);
  }, [iso]);
  return expired;
}

function Capabilities({ write }: { write: boolean }) {
  return (
    <ul className="space-y-1.5 text-sm text-gray-700">
      <li className="flex gap-2">
        <span aria-hidden className="text-green-600">✓</span>
        Read your projects, tasks, comments, goals, reports and inbox
      </li>
      {write && (
        <li className="flex gap-2">
          <span aria-hidden className="text-green-600">✓</span>
          Create and update tasks, comments, projects, sections and goal updates
        </li>
      )}
      <li className="flex gap-2">
        <span aria-hidden className="text-gray-500">✕</span>
        Never delete or archive anything, change members or roles, or upload files
      </li>
    </ul>
  );
}

function Consent({ id, request }: { id: string; request: OAuthConsentRequest }) {
  const { logout } = useAuth();
  const { client, user, workspaces } = request;
  const canWrite = request.requestedScopes.includes('write');
  const [readOnly, setReadOnly] = useState(false);
  const expired = useExpired(request.expiresAt);
  const decide = useMutation({
    mutationFn: (body: OAuthDecision) => oauthApi.decide(id, body),
    onSuccess: ({ redirectUrl }) => {
      if (isSafeRedirect(redirectUrl)) leave.to(redirectUrl);
    },
    meta: { quiet: true },
  });
  const gone = expired ? 'expired' : goneFrom(decide.error);
  if (gone) return <Message title={GONE_COPY[gone].title}>{GONE_COPY[gone].body}</Message>;
  const leaving = decide.isSuccess;
  const busy = decide.isPending || leaving;
  const scope = !canWrite || readOnly ? 'READ' : 'WRITE';

  return (
    <AuthLayout title={`Connect ${client.name}`}>
      <div className="space-y-5">
        <div className="space-y-1 text-sm">
          <p className="text-gray-700">
            <span className="font-medium text-gray-900">{client.name}</span> wants to use Mekari Project as you.
          </p>
          {client.clientIdHost && (
            <p className="text-gray-600">
              Identified by <span className="font-medium text-gray-900">{client.clientIdHost}</span>
            </p>
          )}
          <p className="text-gray-600">
            You’ll go back to <span className="font-medium text-gray-900">{client.redirectHost}</span> afterwards.
          </p>
        </div>
        {request.isLocalRedirect && (
          <p role="note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This is a local app on this computer. Only allow it if you just started connecting it yourself.
          </p>
        )}
        <section aria-label="Signed in as" className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
          <Avatar user={user} size="md" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate font-medium text-gray-900">{user.name}</div>
            <div className="truncate text-gray-500">{user.email}</div>
          </div>
          <button type="button" className="text-xs text-primary-700 hover:underline" disabled={busy} onClick={() => void logout()}>
            Not you?
          </button>
        </section>
        <section aria-label="What it can do" className="space-y-2">
          <h2 className="text-sm font-medium text-gray-900">It will be able to</h2>
          <Capabilities write={scope === 'WRITE'} />
          <p className="text-xs text-gray-500">
            {workspaces.length === 0
              ? 'In every workspace you join, with your role there.'
              : `${workspaces.length === 1 ? 'In your workspace, with your role there' : `In all ${workspaces.length} of your workspaces, with your role in each`}: ${workspaces
                  .map((w) => `${w.name} (${ROLE_LABEL[w.myRole]})`)
                  .join(', ')}.`}
          </p>
        </section>
        {canWrite ? (
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              checked={readOnly}
              disabled={busy}
              onChange={(e) => setReadOnly(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Read only</span>
              <span className="block text-xs text-gray-500">Let it look things up, but not change anything.</span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-gray-500">{client.name} asked for read-only access.</p>
        )}
        {decide.isError && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(decide.error, 'Something went wrong. Try again.')}
          </p>
        )}
        {leaving && (
          <p role="status" className="text-sm text-gray-600">
            Taking you back to {client.redirectHost}…
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => decide.mutate({ approve: false })}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => decide.mutate({ approve: true, scope })}>
            Allow
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}

/**
 * `/connect/authorize?request=<id>` (SPEC §14): the OAuth consent screen. Outside the app shell, so
 * it works with no workspace (M8); `RequireAuth` sends signed-out users to log in and back.
 */
export function ConsentPage() {
  const [params] = useSearchParams();
  const id = params.get('request') ?? '';
  const [framed] = useState(isFramed);
  const request = useQuery({
    queryKey: qk.oauthRequest(id),
    queryFn: () => oauthApi.request(id),
    enabled: !!id && !framed,
    retry: false,
    // A decision is final: never refetch the request behind the user's back.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (framed)
    return (
      <Message title="Open this page directly">
        For your security, this page can’t be shown inside another site. Open it in its own browser tab.
      </Message>
    );
  if (!id) return <Message title={GONE_COPY.invalid.title}>{GONE_COPY.invalid.body}</Message>;
  if (request.isPending)
    return (
      <AuthLayout title="Connect an app">
        <Spinner />
      </AuthLayout>
    );
  if (request.isError) {
    const gone = goneFrom(request.error);
    if (gone) return <Message title={GONE_COPY[gone].title}>{GONE_COPY[gone].body}</Message>;
    return <Message title="Something went wrong">{errorMessage(request.error, 'Couldn’t load this request. Try again.')}</Message>;
  }
  return <Consent id={id} request={request.data} />;
}
