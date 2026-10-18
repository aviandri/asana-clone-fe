import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, workspacesApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { JoinableWorkspace, PendingInvite, Workspace } from '@/api/types';
import { useNotifications } from '@/api/hooks';
import { useCurrentUser } from '@/auth/useAuth';
import { useSwitchWorkspace } from './useWorkspace';

export function useMyInvites() {
  return useQuery({
    queryKey: qk.myInvites,
    queryFn: () => workspacesApi.myInvites().then((r) => r.data),
    refetchInterval: 5 * 60_000,
  });
}

export function useJoinable() {
  return useQuery({
    queryKey: qk.joinable,
    queryFn: () => workspacesApi.joinable().then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

/** Accept → switch into it; Decline → just drop it. */
export function useInviteActions() {
  const qc = useQueryClient();
  const switchTo = useSwitchWorkspace();
  const accept = useMutation({
    mutationFn: (inv: PendingInvite) => workspacesApi.acceptInvite(inv.id),
    onSuccess: (ws) => switchTo(ws, { message: `Welcome to ${ws.name}` }),
  });
  const decline = useMutation({
    mutationFn: (inv: PendingInvite) => workspacesApi.declineInvite(inv.id),
    onSuccess: (_r, inv) => qc.setQueryData<PendingInvite[]>(qk.myInvites, (list) => list?.filter((i) => i.id !== inv.id)),
  });
  return { accept, decline };
}

export function useJoinWorkspace() {
  const switchTo = useSwitchWorkspace();
  return useMutation({
    mutationFn: (ws: JoinableWorkspace) => workspacesApi.join(ws.id),
    onSuccess: (ws) => switchTo(ws, { message: `Welcome to ${ws.name}` }),
  });
}

/**
 * Unread counts for the rail. The current workspace reuses the inbox query; the others ask
 * `/notifications?unread=true&limit=1` with their own X-Workspace-Id (one small request each).
 */
export function useWorkspaceUnread(workspaces: Workspace[]): Record<string, number> {
  const me = useCurrentUser();
  const currentId = me.currentWorkspace?.id;
  const current = useNotifications();
  const others = workspaces.filter((w) => w.id !== currentId);
  const results = useQueries({
    queries: others.map((w) => ({
      queryKey: qk.workspaceUnread(w.id),
      queryFn: () => notificationsApi.list({ unread: true, limit: 1 }, { workspaceId: w.id }).then((r) => r.unreadCount),
      refetchInterval: 60_000,
    })),
  });
  const counts: Record<string, number> = {};
  others.forEach((w, i) => (counts[w.id] = results[i]?.data ?? 0));
  if (currentId) counts[currentId] = current.data?.unreadCount ?? 0;
  return counts;
}
