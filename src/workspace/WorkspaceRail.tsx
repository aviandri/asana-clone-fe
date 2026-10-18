import clsx from 'clsx';
import { useState } from 'react';
import { useCurrentUser } from '@/auth/useAuth';
import { PlusIcon } from '@/components/icons';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { useSwitchWorkspace } from './useWorkspace';
import { useWorkspaceUnread } from './useWorkspaceQueries';
import { WorkspaceTile } from './WorkspaceTile';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Narrow Slack-style rail of workspace tiles; only rendered with ≥ 2 workspaces. */
export function WorkspaceRail() {
  const me = useCurrentUser();
  const switchTo = useSwitchWorkspace();
  const unread = useWorkspaceUnread(me.workspaces);
  const [creating, setCreating] = useState(false);
  const currentId = me.currentWorkspace?.id;
  return (
    <nav aria-label="Workspaces" className="flex h-full w-[60px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-sidebar-top py-3">
      {me.workspaces.map((w, i) => {
        const current = w.id === currentId;
        const hasUnread = !current && (unread[w.id] ?? 0) > 0;
        const shortcut = i < 9 ? ` (${isMac ? '⌘' : 'Ctrl+'}${i + 1})` : '';
        return (
          <button
            key={w.id}
            type="button"
            aria-label={w.name}
            aria-describedby={hasUnread ? 'ws-rail-unread' : undefined}
            aria-current={current ? 'true' : undefined}
            title={`${w.name}${shortcut}`}
            onClick={() => !current && void switchTo(w)}
            className="group relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {/* Left pill: tall for the current workspace, a nub on hover (Slack). */}
            <span
              aria-hidden
              className={clsx(
                'absolute -left-[10px] top-1/2 w-1 -translate-y-1/2 rounded-r bg-white transition-[height,opacity] duration-150',
                current ? 'h-8 opacity-100' : 'h-2 opacity-0 group-hover:opacity-100',
              )}
            />
            <WorkspaceTile
              workspace={w}
              size="lg"
              className={clsx(
                'transition-[transform,box-shadow] duration-150 motion-reduce:transition-none',
                current ? 'ring-2 ring-white ring-offset-2 ring-offset-sidebar-top' : 'opacity-80 group-hover:opacity-100 group-active:scale-95',
              )}
            />
            {hasUnread && <span aria-hidden className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-badge ring-2 ring-sidebar-top" />}
          </button>
        );
      })}
      <button
        type="button"
        aria-label="Create workspace"
        title="Create workspace"
        onClick={() => setCreating(true)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-white/30 text-sidebar-muted outline-none hover:border-white/60 hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
      <span id="ws-rail-unread" hidden>
        Unread notifications
      </span>
      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
    </nav>
  );
}
