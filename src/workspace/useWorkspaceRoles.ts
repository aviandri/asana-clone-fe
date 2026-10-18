import { useMemo } from 'react';
import { useUsers } from '@/api/hooks';
import type { WorkspaceRole } from '@/api/types';

/**
 * Roles of the people the caller can pick in the current workspace, by user id (`GET /users` items
 * carry `role`, SPEC §12 W8). Pickers use it to badge guests and keep them out of what guests can't
 * be (project owner, team member, goal / KR owner); the BE's 400 stays the real guard.
 */
export function useWorkspaceRoles(): Map<string, WorkspaceRole> {
  const users = useUsers();
  return useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.role])), [users.data]);
}

export function useGuestIds(): Set<string> {
  const roles = useWorkspaceRoles();
  return useMemo(() => new Set([...roles].filter(([, r]) => r === 'GUEST').map(([id]) => id)), [roles]);
}
