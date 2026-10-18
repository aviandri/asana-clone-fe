import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type FormEvent } from 'react';
import { adminApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { Invite, Role, User } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { ErrorState } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { timeAgo } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { format } from 'date-fns';
import { GuestBadge } from '../GuestBadge';
import { invalidateMembershipViews } from './invalidate';
import { isExternal, ROLE_LABEL } from './roles';


function RoleOptions({ external }: { external: boolean }) {
  return (
    <>
      <option value="GUEST">Guest</option>
      <option value="MEMBER" disabled={external}>
        Member
      </option>
      <option value="ADMIN" disabled={external}>
        Admin
      </option>
    </>
  );
}

function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary py-1 text-xs"
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

/** Members of the current workspace (incl. deactivated): role incl. Guest, deactivate. */
export function MembersTab() {
  const me = useCurrentUser();
  const ws = me.currentWorkspace!;
  const qc = useQueryClient();
  const users = useQuery({ queryKey: qk.adminUsers, queryFn: () => adminApi.users().then((r) => r.data) });
  const [q, setQ] = useState('');
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; isActive?: boolean }) => adminApi.updateUser(id, body),
    onSuccess: (u) => {
      qc.setQueryData<User[]>(qk.adminUsers, (list) => list?.map((x) => (x.id === u.id ? u : x)));
      invalidateMembershipViews(qc);
    },
    meta: { quiet: true },
  });

  if (users.isLoading) return <Spinner />;
  if (users.isError) return <ErrorState error={users.error} />;
  const s = q.trim().toLowerCase();
  const list = users.data!.filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.includes(s));

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <input aria-label="Filter users" placeholder="Filter by name or email" className="input max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-sm text-gray-500">
          {users.data!.filter((u) => u.isActive).length} active · {users.data!.filter((u) => u.isActive && u.role === 'GUEST').length} guests ·{' '}
          {users.data!.filter((u) => !u.isActive).length} deactivated
        </span>
      </div>
      {update.isError && <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(update.error)}</p>}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className={clsx(!u.isActive && 'text-gray-500')}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar user={u} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate font-medium">
                          {u.name}
                          {self && <span className="text-xs font-normal text-gray-500">(you)</span>}
                          {u.role === 'GUEST' && <GuestBadge />}
                        </div>
                        <div className="truncate text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Role for ${u.name}`}
                      className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-60"
                      value={u.role}
                      disabled={self}
                      title={self ? 'You can’t change your own role' : undefined}
                      onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })}
                    >
                      <RoleOptions external={isExternal(ws, u.email)} />
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <span className={clsx('rounded-full px-2 py-0.5 text-xs', u.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>
                      {u.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{format(new Date(u.createdAt), 'MMM d, yyyy')}</td>
                  <td className="px-3 py-2 text-right">
                    {!self && (
                      <button
                        type="button"
                        className={clsx('text-xs hover:underline', u.isActive ? 'text-red-600' : 'text-primary-600')}
                        onClick={() => {
                          if (!u.isActive || window.confirm(`Deactivate ${u.name}? They’ll lose access to ${ws.name} and leave its teams and projects.`)) {
                            update.mutate({ id: u.id, isActive: !u.isActive });
                          }
                        }}
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Invite links for the current workspace; in an organization, external emails can only be guests. */
export function InvitesTab() {
  const qc = useQueryClient();
  const ws = useCurrentUser().currentWorkspace!;
  const invites = useQuery({ queryKey: qk.adminInvites, queryFn: () => adminApi.invites().then((r) => r.data) });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [created, setCreated] = useState<Invite | null>(null);
  const external = isExternal(ws, email.trim());
  const effectiveRole: Role = external ? 'GUEST' : role;
  const create = useMutation({
    mutationFn: () => adminApi.createInvite(email.trim(), effectiveRole),
    onSuccess: (inv) => {
      setCreated(inv);
      setEmail('');
      void qc.invalidateQueries({ queryKey: qk.adminInvites });
    },
    meta: { quiet: true },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => adminApi.deleteInvite(id),
    onMutate: (id) => qc.setQueryData<Invite[]>(qk.adminInvites, (l) => l?.filter((i) => i.id !== id)),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.adminInvites }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) create.mutate();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 font-semibold">Invite someone</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="inv-email" className="label">Email address</label>
            <input id="inv-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="inv-role" className="label">Role</label>
            <select
              id="inv-role"
              className="input"
              value={effectiveRole}
              disabled={external}
              aria-describedby={external ? 'inv-external' : undefined}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <RoleOptions external={external} />
            </select>
          </div>
          <button type="submit" className="btn-primary py-2" disabled={!email.trim() || create.isPending}>
            Create invite link
          </button>
        </div>
        {external && (
          <p id="inv-external" className="mt-2 text-sm text-gray-600">
            {email.trim().split('@')[1]} isn’t on {ws.domain}, so they’ll join {ws.name} as a guest.
          </p>
        )}
        {create.isError && <p role="alert" className="mt-2 text-sm text-red-600">{errorMessage(create.error)}</p>}
        {created && (
          <div role="status" className="mt-4 rounded-md bg-green-50 p-3 text-sm">
            <p className="text-green-800">
              Invite created for <strong>{created.email}</strong>. No email is sent — share this link with them:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input readOnly aria-label="Invite link" className="input bg-white font-mono text-xs" value={created.inviteUrl} onFocus={(e) => e.currentTarget.select()} />
              <CopyButton text={created.inviteUrl} />
            </div>
          </div>
        )}
      </form>

      <section aria-labelledby="pending-invites">
        <h3 id="pending-invites" className="mb-2 font-semibold">Pending invites</h3>
        {invites.isLoading ? (
          <Spinner />
        ) : invites.isError ? (
          <ErrorState error={invites.error} />
        ) : invites.data!.length === 0 ? (
          <p className="text-sm text-gray-500">No pending invites.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" aria-label="Pending invites">
            {invites.data!.map((inv) => {
              const expired = new Date(inv.expiresAt) < new Date();
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {inv.email} <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">{ROLE_LABEL[inv.role]}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Invited {timeAgo(inv.createdAt)}
                      {inv.invitedBy && <> by {inv.invitedBy.name}</>} ·{' '}
                      <span className={clsx(expired && 'text-red-600')}>
                        {expired ? 'expired' : 'expires'} {format(new Date(inv.expiresAt), 'MMM d')}
                      </span>
                    </div>
                  </div>
                  {!expired && <CopyButton text={inv.inviteUrl} />}
                  <button type="button" className="text-xs text-red-600 hover:underline" aria-label={`Revoke invite for ${inv.email}`} onClick={() => revoke.mutate(inv.id)}>
                    Revoke
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
