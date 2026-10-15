import { useContext } from 'react';
import { AuthContext, type AuthState } from './authContext';

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The logged-in user. Only use under <RequireAuth>. */
export function useCurrentUser() {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used without an authenticated user');
  return user;
}
