import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/auth/useAuth';
import { FullPageSpinner } from '@/components/Spinner';
import { useSwitchWorkspace } from './useWorkspace';

const WORKSPACE_PARAM = 'workspace';

/**
 * `?workspace=<id>` (links from the Mac app, SPEC-MAC §5): if it names one of my workspaces, switch
 * to it silently, then drop the param from the URL; any other value is ignored. Runs before the
 * shell mounts, so the page underneath loads in the right workspace (and no deep-link toast fires).
 */
export function ApplyWorkspaceParam({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const switchTo = useSwitchWorkspace();
  const raw = new URLSearchParams(location.search).get(WORKSPACE_PARAM);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (raw === null || handled.current === location.key) return;
    handled.current = location.key;
    const strip = () => {
      const next = new URLSearchParams(location.search);
      next.delete(WORKSPACE_PARAM);
      const search = next.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }, { replace: true });
    };
    const target = me.workspaces.find((w) => w.id === raw);
    if (target && target.id !== me.currentWorkspace?.id) void switchTo(target, { to: false, message: null }).finally(strip);
    else strip();
  }, [raw, location, me, navigate, switchTo]);

  if (raw !== null) return <FullPageSpinner />;
  return <>{children}</>;
}
