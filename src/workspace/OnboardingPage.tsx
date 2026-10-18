import type { ReactNode } from 'react';
import { useAuth, useCurrentUser } from '@/auth/useAuth';
import { AppIcon, MekariLockup } from '@/components/brand/Brand';
import { CreateWorkspaceForm } from './CreateWorkspaceDialog';
import { useInviteActions, useJoinable, useJoinWorkspace, useMyInvites } from './useWorkspaceQueries';
import { WorkspaceTile } from './WorkspaceTile';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

/** Shown when the user belongs to no workspace (SPEC §12): accept an invite, join, or create. */
export function OnboardingPage() {
  const me = useCurrentUser();
  const { logout } = useAuth();
  const invites = useMyInvites();
  const joinable = useJoinable();
  const { accept, decline } = useInviteActions();
  const join = useJoinWorkspace();
  const first = me.name.split(' ')[0];

  return (
    <main className="flex min-h-full justify-center bg-gradient-to-br from-primary-50 via-white to-info-soft px-4 py-12">
      <div className="w-full max-w-lg space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <AppIcon className="h-12 w-12 drop-shadow-sm" />
          <MekariLockup />
          <h1 className="text-2xl font-semibold text-gray-900">Welcome, {first}!</h1>
          <p className="text-sm text-gray-600">You’re not in a workspace yet. Join your team or start a fresh one.</p>
        </div>

        {!!invites.data?.length && (
          <Card title="Your invitations">
            <ul className="space-y-2">
              {invites.data.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3">
                  <WorkspaceTile workspace={inv.workspace} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{inv.workspace.name}</span>
                    <span className="block truncate text-gray-500">
                      {inv.invitedBy.name} invited you
                      {inv.role === 'GUEST' ? ' as a guest' : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn-primary"
                    aria-label={`Accept invite to ${inv.workspace.name}`}
                    disabled={accept.isPending}
                    onClick={() => accept.mutate(inv)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label={`Decline invite to ${inv.workspace.name}`}
                    disabled={decline.isPending}
                    onClick={() => decline.mutate(inv)}
                  >
                    Decline
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {!!joinable.data?.length && (
          <Card title="Join your organization">
            <ul className="space-y-2">
              {joinable.data.map((o) => (
                <li key={o.id} className="flex items-center gap-3">
                  <WorkspaceTile workspace={o} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{o.name}</span>
                    <span className="block text-gray-500">
                      {o.memberCount} {o.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </span>
                  <button type="button" className="btn-primary" disabled={join.isPending} onClick={() => join.mutate(o)}>
                    Join {o.name}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Create a workspace">
          <CreateWorkspaceForm />
        </Card>

        <p className="text-center text-sm text-gray-500">
          Signed in as {me.email}.{' '}
          <button type="button" className="font-medium text-primary-600 underline-offset-2 hover:underline" onClick={() => void logout()}>
            Log out
          </button>
        </p>
      </div>
    </main>
  );
}
