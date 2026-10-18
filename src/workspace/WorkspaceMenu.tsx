import clsx from 'clsx';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Workspace } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { PlusIcon, SettingsIcon } from '@/components/icons';
import { useSwitchWorkspace } from './useWorkspace';
import { useInviteActions, useJoinable, useJoinWorkspace, useMyInvites } from './useWorkspaceQueries';
import { WorkspaceTile } from './WorkspaceTile';

const ROLE_LABEL = {
  ADMIN: 'Admin',
  MEMBER: 'Member',
  GUEST: 'Guest',
} as const;
const rowBtn =
  'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm text-gray-800 outline-none hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-500';
const heading = 'px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500';
const ITEMS = '[role^="menuitem"]:not([disabled])';

/** Arrow keys / Home / End move between menu items (Escape is handled by the popover). */
function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(ITEMS)];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const go = (n: number) => {
    e.preventDefault();
    items[(n + items.length) % items.length]?.focus();
  };
  if (e.key === 'ArrowDown') go(i + 1);
  else if (e.key === 'ArrowUp') go(i < 0 ? -1 : i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(-1);
}

/**
 * The Slack-style workspace menu (SPEC §12): workspaces with ✓ on the current one, pending
 * invites, joinable organizations, Create workspace, and Workspace settings for admins. Used by the
 * sidebar switcher and the profile dialog.
 */
export function WorkspaceMenuContent({ onDone, onCreate, label = 'Switch workspace' }: { onDone: () => void; onCreate: () => void; label?: string }) {
  const me = useCurrentUser();
  const current = me.currentWorkspace;
  const switchTo = useSwitchWorkspace();
  const invites = useMyInvites();
  const joinable = useJoinable();
  const { accept, decline } = useInviteActions();
  const join = useJoinWorkspace();

  const pick = (w: Workspace) => {
    onDone();
    if (w.id !== current?.id) void switchTo(w);
  };

  return (
    <div role="menu" aria-label={label} className="space-y-1" onKeyDown={onMenuKey}>
      <div className={heading} aria-hidden>
        Workspaces
      </div>
      <div role="group" aria-label="Workspaces" className="space-y-0.5">
        {me.workspaces.map((w, i) => {
          const isCurrent = w.id === current?.id;
          return (
            <button
              key={w.id}
              type="button"
              role="menuitemradio"
              aria-checked={isCurrent}
              aria-label={w.name}
              aria-describedby={`ws-meta-${w.id}`}
              className={rowBtn}
              onClick={() => pick(w)}
            >
              <WorkspaceTile workspace={w} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{w.name}</span>
                <span id={`ws-meta-${w.id}`} className="block truncate text-xs text-gray-500">
                  {ROLE_LABEL[w.myRole]} · {w.memberCount} {w.memberCount === 1 ? 'member' : 'members'}
                </span>
              </span>
              {i < 9 && me.workspaces.length > 1 && (
                <kbd className="hidden rounded border border-gray-200 px-1 font-sans text-[10px] text-gray-500 sm:inline" aria-hidden>
                  {i + 1}
                </kbd>
              )}
              <span aria-hidden className={clsx('w-4 text-primary-600', !isCurrent && 'invisible')}>
                ✓
              </span>
            </button>
          );
        })}
      </div>

      {!!invites.data?.length && (
        <>
          <div className={heading} aria-hidden>
            Invitations
          </div>
          <div role="group" aria-label="Invitations" className="space-y-1">
            {invites.data.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm">
                <WorkspaceTile workspace={inv.workspace} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gray-800">{inv.workspace.name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {inv.invitedBy.name} invited you
                    {inv.role === 'GUEST' ? ' as a guest' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  role="menuitem"
                  className="btn-primary px-2 py-1 text-xs"
                  aria-label={`Accept invite to ${inv.workspace.name}`}
                  disabled={accept.isPending}
                  onClick={() => accept.mutate(inv, { onSuccess: onDone })}
                >
                  Accept
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn-ghost px-2 py-1 text-xs"
                  aria-label={`Decline invite to ${inv.workspace.name}`}
                  disabled={decline.isPending}
                  onClick={() => decline.mutate(inv)}
                >
                  Decline
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {!!joinable.data?.length && (
        <div role="group" aria-label="Organizations you can join" className="space-y-0.5 border-t border-gray-100 pt-1">
          {joinable.data.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              className={rowBtn}
              disabled={join.isPending}
              onClick={() => join.mutate(o, { onSuccess: onDone })}
            >
              <WorkspaceTile workspace={o} size="sm" />
              <span className="flex-1 truncate">
                Join {o.name} ({o.memberCount} {o.memberCount === 1 ? 'member' : 'members'})
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-0.5 border-t border-gray-100 pt-1">
        <button
          type="button"
          role="menuitem"
          className={rowBtn}
          onClick={() => {
            onDone();
            onCreate();
          }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-500">
            <PlusIcon className="h-3.5 w-3.5" />
          </span>
          Create workspace
        </button>
        {current?.myRole === 'ADMIN' && (
          <Link to="/workspace/settings" role="menuitem" className={rowBtn} onClick={onDone}>
            <span className="flex h-6 w-6 items-center justify-center text-gray-500">
              <SettingsIcon className="h-4 w-4" />
            </span>
            Workspace settings
          </Link>
        )}
      </div>
    </div>
  );
}
