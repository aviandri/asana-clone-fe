import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

// Switches run one at a time per tab, and only the newest one commits: Ctrl+2 then Ctrl+3 in quick
// succession must not leave the cache on one workspace and the header on another. The header and
// cache change together, at commit, so requests in between stay consistent with what's shown.
let seq = 0;
let queue: Promise<void> = Promise.resolve();
// A page and its task panel may both ask for the same deep-link switch.
let pendingId: string | null = null;

/** Make `me.currentWorkspace` this tab's workspace and drop everything cached for the old one. */
function commit(qc: QueryClient, me: Me) {
  setWorkspaceId(me.currentWorkspace?.id ?? null);
  resetWorkspaceCache(qc, me);
}

export function useSwitchWorkspace() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    (ws: Pick<Workspace, 'id' | 'name'>, opts: SwitchOpts = {}) => {
      if (pendingId === ws.id) return queue;
      const mine = ++seq;
      pendingId = ws.id;
      const stale = () => mine !== seq;
      const run = async () => {
        if (stale()) return; // superseded while queued
        try {
          if (!opts.alreadyCurrent) await workspacesApi.switch(ws.id);
          if (stale()) return;
          const me = await authApi.me({ workspaceId: ws.id });
          if (stale()) return;
          commit(qc, me);
          if (opts.to !== false) navigate(opts.to ?? '/');
          showToast(opts.message ?? `Switched to ${ws.name}`, 'info');
        } catch (e) {
          if (!stale()) showToast(errorMessage(e));
        } finally {
          if (!stale()) pendingId = null;
        }
      };
      queue = queue.then(run);
      return queue;
    },
    [qc, navigate],
  );
}

let recovering = false;

/**
 * This tab's workspace answered 404 on a scoped endpoint: we were deactivated or removed there
 * mid-session. Ask `/auth/me` without a header (the server picks another workspace, or none →
 * onboarding), reset, and go Home, cancelling any queued switch. If the server still puts us in
 * the same workspace, the 404 was about something else: do nothing at all.
 */
export async function recoverLostWorkspace(qc: QueryClient, navigate: (to: string) => void) {
  if (recovering) return;
  recovering = true;
  const before = seq;
  const lost = qc.getQueryData<Me>(qk.me)?.currentWorkspace;
  try {
    const me = await authApi.me({ workspaceId: null });
    if (seq !== before) return; // a switch started meanwhile: it decides
    if (lost && me.currentWorkspace?.id === lost.id) return; // false alarm
    seq++;
    pendingId = null;
    commit(qc, me);
    navigate('/');
    if (lost) showToast(`You no longer have access to ${lost.name}`, 'info');
  } catch (e) {
    showToast(errorMessage(e));
  } finally {
    recovering = false;
  }
}

/**
 * After leaving or deleting the current workspace: let the server pick where we land (another
 * workspace, or none → onboarding), reset and go Home. Cancels any queued switch.
 */
export function useExitWorkspace() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    async (message: string) => {
      seq++;
      pendingId = null;
      const me = await authApi.me({ workspaceId: null });
      commit(qc, me);
      navigate('/');
      showToast(message, 'info');
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

// Location keys that already auto-switched: at most one automatic switch per visit, so a URL
// mixing workspaces can never bounce between them.
const followed = new Set<string>();
/** Pages whose own resource (project, goal) decides the workspace; a task panel on them doesn't. */
const PAGE_OWNED = /^\/(projects|goals)\//;

/**
 * Deep links (SPEC §12): when a loaded task / project / goal lives in another workspace the user
 * belongs to, switch there (staying on the URL) with a toast. The page-level resource wins: a task
 * panel on a project or goal page doesn't switch, and gets that workspace back to show instead.
 */
export function useFollowWorkspace(workspaceId: string | undefined, noun: keyof typeof NOUN_COPY): Workspace | undefined {
  const me = useCurrentUser();
  const switchTo = useSwitchWorkspace();
  const location = useLocation();
  const current = me.currentWorkspace?.id;
  const target = workspaceId && workspaceId !== current ? me.workspaces.find((w) => w.id === workspaceId) : undefined;
  const deferToPage = noun === 'task' && PAGE_OWNED.test(location.pathname);
  const auto = target && !deferToPage && !followed.has(location.key) ? target : undefined;
  useEffect(() => {
    if (!auto) return;
    followed.add(location.key);
    void switchTo(auto, {
      to: false,
      message: `Switched to ${auto.name} to open ${NOUN_COPY[noun]}`,
    });
  }, [auto, noun, switchTo, location.key]);
  return target && !auto ? target : undefined;
}

/** Tests: forget auto-switch history (location keys repeat across memory routers). */
export function resetFollowHistory() {
  followed.clear();
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
