import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { FullPageSpinner } from '@/components/Spinner';
import { safeNext } from '@/lib/url';
import { useAuth } from './useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageSpinner />;
  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

/** Admin of the current workspace. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** No workspace yet (SPEC §12) → the onboarding screen instead of the app. */
export function RequireWorkspace({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { user } = useAuth();
  if (user && !user.currentWorkspace) return <>{fallback}</>;
  return <>{children}</>;
}

/** For /login: bounce authenticated users into the app (honouring a safe ?next=). */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [params] = useSearchParams();
  if (isLoading) return <FullPageSpinner />;
  if (user) return <Navigate to={safeNext(params.get('next'))} replace />;
  return <>{children}</>;
}
