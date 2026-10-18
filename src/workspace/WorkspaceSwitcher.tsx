import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '@/auth/useAuth';
import { ChevronDownIcon } from '@/components/icons';
import { Popover } from '@/components/Popover';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { LeaveWorkspaceDialog } from './LeaveWorkspaceDialog';
import { WorkspaceMenuContent } from './WorkspaceMenu';
import { GuestBadge } from './GuestBadge';
import { WorkspaceTile } from './WorkspaceTile';

/** Workspace tile + name at the top of the sidebar; opens the workspace menu. */
export function WorkspaceSwitcher() {
  const me = useCurrentUser();
  const ws = me.currentWorkspace;
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const p = panel.current;
    (p?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ?? p?.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus();
  }, [open]);

  if (!ws) return null;
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <div className="relative mx-2 mb-2 mt-3">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Workspace menu"
        className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left text-white outline-none transition-colors hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        onClick={() => setOpen((o) => !o)}
      >
        <WorkspaceTile workspace={ws} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{ws.name}</span>
        {ws.myRole === 'GUEST' && <GuestBadge tone="dark" />}
        <ChevronDownIcon className={clsx('h-4 w-4 shrink-0 text-sidebar-muted transition-transform', open && 'rotate-180')} />
      </button>
      <Popover open={open} onClose={close} className="w-72 max-w-[calc(100vw-2rem)] p-2 text-gray-900">
        <div ref={panel}>
          <WorkspaceMenuContent onDone={() => setOpen(false)} onCreate={() => setCreating(true)} onLeave={() => setLeaving(true)} />
        </div>
      </Popover>
      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
      <LeaveWorkspaceDialog workspace={ws} open={leaving} onClose={() => setLeaving(false)} />
    </div>
  );
}
