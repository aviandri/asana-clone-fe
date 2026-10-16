import { useQuery } from '@tanstack/react-query';
import { teamsApi } from '@/api/endpoints';
import { useTeams } from '@/api/hooks';
import { qk } from '@/api/queryKeys';
import { useCurrentUser } from '@/auth/useAuth';

/** Teams a user may create projects in: their own teams, or every team for admins (BE#4). */
export function useCreatableTeams() {
  const me = useCurrentUser();
  const all = useTeams();
  const mine = useQuery({
    queryKey: qk.teams(true),
    queryFn: () => teamsApi.list(true).then((r) => r.data),
    enabled: me.role !== 'ADMIN',
  });
  return me.role === 'ADMIN' ? all : mine;
}
