import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { TeamDetail } from '@/api/types';

export function useTeamMutations(teamId?: string) {
  const qc = useQueryClient();
  const onDetail = (t: TeamDetail) => {
    qc.setQueryData(qk.team(t.id), t);
    void qc.invalidateQueries({ queryKey: ['teams'] });
    // Membership affects which TEAM projects are visible.
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };
  const quiet = { meta: { quiet: true } };
  return {
    create: useMutation({ mutationFn: (body: { name: string; description?: string }) => teamsApi.create(body), onSuccess: onDetail, ...quiet }),
    update: useMutation({
      mutationFn: (body: { name?: string; description?: string | null }) => teamsApi.update(teamId!, body),
      onSuccess: onDetail,
      ...quiet,
    }),
    remove: useMutation({
      mutationFn: () => teamsApi.delete(teamId!),
      onSuccess: () => {
        qc.removeQueries({ queryKey: qk.team(teamId!) });
        void qc.invalidateQueries({ queryKey: ['teams'] });
      },
      ...quiet,
    }),
    addMember: useMutation({ mutationFn: (userId: string) => teamsApi.addMember(teamId!, userId), onSuccess: onDetail, ...quiet }),
    removeMember: useMutation({ mutationFn: (userId: string) => teamsApi.removeMember(teamId!, userId), onSuccess: onDetail, ...quiet }),
  };
}
