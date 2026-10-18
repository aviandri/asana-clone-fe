import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { ApiError, setUnauthorizedHandler } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { Me } from '@/api/types';
import { getWorkspaceId, setWorkspaceId } from '@/workspace/workspaceId';
import { AuthContext, type AuthState } from './authContext';

/** Adopt the server's idea of this tab's workspace before anything else fetches. */
function adopt(me: Me) {
  setWorkspaceId(me.currentWorkspace?.id ?? null);
  return me;
}

async function fetchMe(): Promise<Me | null> {
  try {
    return adopt(await authApi.me());
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    // A remembered workspace we're no longer in → ask again without it (server picks the last one).
    if (e instanceof ApiError && e.status === 404 && getWorkspaceId()) {
      setWorkspaceId(null);
      return adopt(await authApi.me({ workspaceId: null }));
    }
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useQuery({ queryKey: qk.me, queryFn: fetchMe, staleTime: Infinity });

  const setSession = useCallback(
    (user: Me | null) => {
      // Drop every cached resource of the previous user / workspace.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.me[0] });
      if (user) adopt(user);
      qc.setQueryData(qk.me, user);
    },
    [qc],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    return () => setUnauthorizedHandler(null);
  }, [setSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const user = await authApi.login(email, password);
      setSession(user);
      return user;
    },
    [setSession],
  );
  const acceptInvite = useCallback(
    async (token: string, name: string, password: string) => {
      const user = await authApi.acceptInvite(token, name, password);
      setSession(user);
      return user;
    },
    [setSession],
  );
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setSession(null);
    }
  }, [setSession]);

  const value = useMemo<AuthState>(
    () => ({
      user: meQuery.data ?? null,
      isLoading: meQuery.isLoading,
      login,
      acceptInvite,
      logout,
    }),
    [meQuery.data, meQuery.isLoading, login, acceptInvite, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
