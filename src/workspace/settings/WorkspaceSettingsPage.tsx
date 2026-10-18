import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi, workspacesApi, type UpdateWorkspaceInput } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { User, Workspace } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { ColorPicker } from '@/components/ColorPicker';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/lib/errors';
import { showToast } from '@/lib/toast';
import { LeaveWorkspaceDialog } from '../LeaveWorkspaceDialog';
import { useExitWorkspace, useRefreshMe } from '../useWorkspace';
import { WorkspaceTile } from '../WorkspaceTile';
import { invalidateMembershipViews } from './invalidate';
import { InvitesTab, MembersTab } from './MembersTabs';
import { isExternal } from './roles';

type Tab = 'general' | 'organization' | 'members' | 'invites' | 'danger';
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'organization', label: 'Organization' },
  { key: 'members', label: 'Members' },
  { key: 'invites', label: 'Invites' },
  { key: 'danger', label: 'Danger zone' },
];

function Section({ title, children, tone }: { title: string; children: ReactNode; tone?: 'danger' }) {
  return (
    <section aria-label={title} className={clsx('rounded-lg border p-5', tone === 'danger' ? 'border-red-200' : 'border-gray-200')}>
      <h2 className={clsx('mb-3 font-semibold', tone === 'danger' && 'text-red-700')}>{title}</h2>
      {children}
    </section>
  );
}

/** PATCH the current workspace, then refresh Me so the switcher, rail and menu pick it up. */
function useUpdateWorkspace(ws: Workspace) {
  const refreshMe = useRefreshMe();
  return useMutation({
    mutationFn: (body: UpdateWorkspaceInput) => workspacesApi.update(ws.id, body),
    onSuccess: () => refreshMe(),
    meta: { quiet: true },
  });
}

function GeneralTab({ ws }: { ws: Workspace }) {
  const [name, setName] = useState(ws.name);
  const [color, setColor] = useState(ws.color);
  const [leaving, setLeaving] = useState(false);
  const update = useUpdateWorkspace(ws);
  const dirty = name.trim() !== ws.name || color !== ws.color;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    update.mutate({ name: name.trim(), color }, { onSuccess: () => showToast('Workspace updated', 'info') });
  };
  return (
    <div className="space-y-6">
      <Section title="Workspace details">
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-end gap-3">
            <WorkspaceTile workspace={{ name: name || ws.name, color }} size="lg" />
            <div className="flex-1">
              <label htmlFor="ws-settings-name" className="label">
                Workspace name
              </label>
              <input id="ws-settings-name" className="input" value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <fieldset>
            <legend className="label">Workspace color</legend>
            <ColorPicker value={color} onChange={setColor} />
          </fieldset>
          {update.isError && (
            <p role="alert" className="text-sm text-red-600">
              {errorMessage(update.error)}
            </p>
          )}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={!dirty || !name.trim() || update.isPending}>
              Save changes
            </button>
          </div>
        </form>
      </Section>
      <Section title="Leave workspace">
        <p className="mb-3 text-sm text-gray-600">
          {ws.memberCount <= 1
            ? `You’re the only member of ${ws.name}. To close it, delete it in the Danger zone.`
            : `Leave ${ws.name}. A workspace always keeps at least one admin, so make someone else an admin first if you’re the only one.`}
        </p>
        <button type="button" className="btn-secondary" onClick={() => setLeaving(true)}>
          Leave workspace
        </button>
      </Section>
      <LeaveWorkspaceDialog workspace={ws} open={leaving} onClose={() => setLeaving(false)} />
    </div>
  );
}

/** Who would become a guest if `domain` were the organization's domain (active, off-domain, not yet guests). */
function wouldBecomeGuests(users: User[] | undefined, domain: string) {
  const probe = { isOrganization: true, domain };
  return (users ?? []).filter((u) => u.isActive && u.role !== 'GUEST' && isExternal(probe, u.email));
}

function OrganizationTab({ ws }: { ws: Workspace }) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: qk.adminUsers, queryFn: () => adminApi.users().then((r) => r.data) });
  const [domain, setDomain] = useState(ws.domain ?? me.email.split('@')[1] ?? '');
  const [confirming, setConfirming] = useState(false);
  const [turningOff, setTurningOff] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const update = useUpdateWorkspace(ws);
  const clean = domain.trim().toLowerCase().replace(/^@/, '');
  const affected = wouldBecomeGuests(users.data, clean);
  const changed = !ws.isOrganization || clean !== ws.domain;

  const afterMembershipChange = () => invalidateMembershipViews(qc);
  const openConfirm = () => {
    // The BE requires the caller's own email on the domain (400); say so before the dialog.
    if (!me.email.toLowerCase().endsWith(`@${clean}`)) {
      setDomainError(`Your own email (${me.email}) must be on ${clean} to use it as the organization’s domain.`);
      return;
    }
    setDomainError(null);
    update.reset();
    setConfirming(true);
  };
  const convert = () =>
    update.mutate(
      { isOrganization: true, domain: clean },
      {
        onSuccess: (res) => {
          setConfirming(false);
          afterMembershipChange();
          const n = res.convertedToGuests ?? 0;
          showToast(
            `${ws.isOrganization ? 'Domain updated' : `${ws.name} is now an organization`}${n ? ` · ${n} ${n === 1 ? 'person' : 'people'} became guests` : ''}`,
            'info',
          );
        },
      },
    );
  const turnOff = () =>
    update.mutate(
      { isOrganization: false },
      {
        onSuccess: () => {
          setTurningOff(false);
          afterMembershipChange();
          showToast(`${ws.name} is no longer an organization`, 'info');
        },
        onError: () => setTurningOff(false),
      },
    );

  return (
    <div className="space-y-6">
      <Section title={ws.isOrganization ? `Organization · ${ws.domain}` : 'Make this an organization'}>
        <p className="mb-4 text-sm text-gray-600">
          {ws.isOrganization
            ? `Anyone with an @${ws.domain} email can join ${ws.name} as a member. People outside the domain can only be guests.`
            : 'Tie this workspace to your company’s email domain: colleagues on that domain can join on their own, and everyone outside it becomes a guest.'}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (clean && changed) openConfirm();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[14rem] flex-1">
            <label htmlFor="ws-domain" className="label">
              Email domain
            </label>
            <input
              id="ws-domain"
              className="input"
              value={domain}
              placeholder="mekari.com"
              aria-invalid={!!domainError}
              aria-describedby={domainError ? 'ws-domain-error' : undefined}
              onChange={(e) => {
                setDomain(e.target.value);
                setDomainError(null);
              }}
              required
            />
          </div>
          <button type="submit" className="btn-primary py-2" disabled={!clean || !changed || update.isPending}>
            {ws.isOrganization ? 'Change domain' : 'Convert to organization'}
          </button>
        </form>
        {domainError && (
          <p id="ws-domain-error" role="alert" className="mt-3 text-sm text-red-600">
            {domainError}
          </p>
        )}
        {update.isError && !confirming && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {errorMessage(update.error)}
          </p>
        )}
      </Section>
      {ws.isOrganization && (
        <Section title="Turn off organization">
          <p className="mb-3 text-sm text-gray-600">People on {ws.domain} can no longer join on their own. Everyone keeps their current role, guests included.</p>
          <button type="button" className="btn-secondary" onClick={() => setTurningOff(true)}>
            Turn off organization
          </button>
        </Section>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} title={ws.isOrganization ? `Change domain to ${clean}?` : `Convert to an organization on ${clean}?`}>
        <div className="space-y-4 px-5 pb-5 pt-2 text-sm text-gray-600">
          {/* Never say "no roles change" before we actually know who's in the workspace. */}
          {users.isPending ? (
            <p className="flex items-center gap-2" role="status">
              <Spinner /> Checking who would become a guest…
            </p>
          ) : users.isError ? (
            <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">
              Couldn’t load the member list, so we can’t show who would become a guest. {errorMessage(users.error)}{' '}
              <button type="button" className="font-medium underline" onClick={() => void users.refetch()}>
                Try again
              </button>
            </div>
          ) : affected.length === 0 ? (
            <p>Everyone in {ws.name} is on {clean} or already a guest, so no roles change.</p>
          ) : (
            <>
              <p>
                {affected.length === 1 ? 'This person isn’t' : `These ${affected.length} people aren’t`} on {clean}, so they’ll become guests: they keep their
                projects but leave their teams and can’t see goals.
              </p>
              <ul aria-label="People who will become guests" className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
                {affected.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 px-3 py-1.5">
                    <Avatar user={u} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-gray-800">{u.name}</span>
                    <span className="truncate text-xs text-gray-500">{u.email}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p>Deactivated members and pending invites outside {clean} become guests too, so they can’t come back as members later.</p>
          {update.isError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">
              {errorMessage(update.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={!users.isSuccess || update.isPending} onClick={convert}>
              {ws.isOrganization ? 'Change domain' : 'Convert'}
            </button>
          </div>
        </div>
      </Modal>
      <Modal open={turningOff} onClose={() => setTurningOff(false)} title="Turn off organization?">
        <div className="space-y-4 px-5 pb-5 pt-2 text-sm text-gray-600">
          <p>{ws.name} will no longer be tied to {ws.domain}. Roles stay as they are.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setTurningOff(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={update.isPending} onClick={turnOff}>
              Turn off
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DangerTab({ ws }: { ws: Workspace }) {
  const [typed, setTyped] = useState('');
  const exit = useExitWorkspace();
  const del = useMutation({
    mutationFn: () => workspacesApi.delete(ws.id, typed),
    onSuccess: () => exit(`Deleted ${ws.name}`),
    meta: { quiet: true },
  });
  return (
    <Section title="Delete workspace" tone="danger">
      <p className="mb-3 text-sm text-gray-600">
        This permanently deletes {ws.name} and everything in it: teams, projects, tasks, goals and the inbox, for all {ws.memberCount}{' '}
        {ws.memberCount === 1 ? 'member' : 'members'}. It can’t be undone.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (typed === ws.name) del.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <label htmlFor="ws-confirm-name" className="label">
            Type <strong className="font-semibold text-gray-900">{ws.name}</strong> to confirm
          </label>
          <input id="ws-confirm-name" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        {del.isError && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(del.error)}
          </p>
        )}
        <button type="submit" className="btn-danger" disabled={typed !== ws.name || del.isPending}>
          Delete workspace
        </button>
      </form>
    </Section>
  );
}

/** SPEC §12 workspace settings (ADMIN only; replaces the v1 Admin page). The tab lives in `?tab=`. */
export function WorkspaceSettingsPage() {
  const ws = useCurrentUser().currentWorkspace!;
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'general';
  const setTab = (t: Tab) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('tab', t);
      return next;
    });
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Workspace settings" icon={<WorkspaceTile workspace={ws} />}>
        <div role="tablist" aria-label="Workspace settings sections" className="flex gap-4 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                '-mb-px whitespace-nowrap border-b-2 px-1 pb-2 text-sm',
                tab === t.key ? 'border-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </PageHeader>
      <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)!.label} className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          {/* Keyed by workspace so forms reset if an admin switches while here. */}
          {tab === 'general' && <GeneralTab key={ws.id} ws={ws} />}
          {tab === 'organization' && <OrganizationTab key={ws.id} ws={ws} />}
          {tab === 'members' && <MembersTab />}
          {tab === 'invites' && <InvitesTab />}
          {tab === 'danger' && <DangerTab key={ws.id} ws={ws} />}
        </div>
      </div>
    </div>
  );
}
