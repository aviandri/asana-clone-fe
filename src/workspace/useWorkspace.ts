import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, workspacesApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { Me, Workspace } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { errorMessage } from '@/lib/errors';
import { showToast } from '@/lib/toast';
import { setWorkspaceId } from './workspaceId';

/**
 * Drop everything cached for the previous workspace and install the new `Me`. The shell is keyed
 * by the current workspace id, so pages remount and refetch with the new X-Workspace-Id.
 */
export function resetWorkspaceCache(qc: QueryClient, me: Me) {
  void qc.cancelQueries();
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.me[0] });
  qc.setQueryData(qk.me, me);
}

type SwitchOpts = {
  /** Where to land afterwards; `false` stays on the current URL (deep links). Default: Home. */
  to?: string | false;
  /** Toast text; default "Switched to <name>". */
  message?: string;
  /** The server already made it current (POST /workspaces does) — skip POST /switch. */
  alreadyCurrent?: boolean;
};

// One switch at a time per tab: a page and its task panel may both ask for the same deep-link switch.
let inFlight: string | null = null;

export function useSwitchWorkspace() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    async (ws: Pick<Workspace, 'id' | 'name'>, opts: SwitchOpts = {}) => {
      if (inFlight === ws.id) return;
      inFlight = ws.id;
      try {
        if (!opts.alreadyCurrent) await workspacesApi.switch(ws.id);
        setWorkspaceId(ws.id);
        const me = await authApi.me();
        resetWorkspaceCache(qc, me);
        if (opts.to !== false) navigate(opts.to ?? '/');
        showToast(opts.message ?? `Switched to ${ws.name}`, 'info');
      } catch (e) {
        showToast(errorMessage(e));
      } finally {
        inFlight = null;
      }
    },
    [qc, navigate],
  );
}

/** Re-read `Me` (workspace list, role) after joining, leaving or editing a workspace. */
export function useRefreshMe() {
  const qc = useQueryClient();
  return useCallback(async () => {
    const me = await authApi.me();
    qc.setQueryData(qk.me, me);
    return me;
  }, [qc]);
}

export function useCurrentWorkspace(): Workspace | null {
  return useCurrentUser().currentWorkspace;
}

const NOUN_COPY = {
  task: 'this task',
  project: 'this project',
  goal: 'this goal',
} as const;

/**
 * Deep links (SPEC §12): when a loaded task / project / goal lives in another workspace the user
 * belongs to, switch there (staying on the URL) with a toast.
 */
export function useFollowWorkspace(workspaceId: string | undefined, noun: keyof typeof NOUN_COPY) {
  const me = useCurrentUser();
  const switchTo = useSwitchWorkspace();
  const current = me.currentWorkspace?.id;
  const target = workspaceId && workspaceId !== current ? me.workspaces.find((w) => w.id === workspaceId) : undefined;
  useEffect(() => {
    if (target)
      void switchTo(target, {
        to: false,
        message: `Switched to ${target.name} to open ${NOUN_COPY[noun]}`,
      });
  }, [target, noun, switchTo]);
}

/** Ctrl/⌘ + 1…9 switches workspaces (when there are ≥ 2). */
export function useWorkspaceHotkeys() {
  const me = useCurrentUser();
  const switchTo = useSwitchWorkspace();
  return useCallback((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !/^[1-9]$/.test(e.key)) return false;
    if (me.workspaces.length < 2) return false;
    const target = me.workspaces[Number(e.key) - 1];
    if (!target) return false;
    e.preventDefault();
    if (target.id !== me.currentWorkspace?.id) void switchTo(target);
    return true;
  }, [me, switchTo]);
}
