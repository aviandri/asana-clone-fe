import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { ApiError, setUnauthorizedHandler } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { User } from '@/api/types';
import { AuthContext, type AuthState } from './authContext';

async function fetchMe(): Promise<User | null> {
  try {
    return await authApi.me();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useQuery({ queryKey: qk.me, queryFn: fetchMe, staleTime: Infinity });

  const setSession = useCallback(
    (user: User | null) => {
      if (!user) {
        // Drop every cached resource of the previous user.
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.me[0] });
      }
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
