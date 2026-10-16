import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { CreateProjectInput, ProjectDetail, ProjectRole, UpdateProjectInput } from '@/api/types';

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectsApi.create(input),
    onSuccess: (p) => {
      qc.setQueryData(qk.project(p.id), p);
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useProjectMutations(projectId: string) {
  const qc = useQueryClient();
  const onDetail = (p: ProjectDetail) => {
    qc.setQueryData(qk.project(p.id), p);
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };
  // Errors are rendered inline by the settings UI (e.g. 409 last owner), so skip the global toast.
  const quiet = { meta: { quiet: true } };
  return {
    update: useMutation({ mutationFn: (body: UpdateProjectInput) => projectsApi.update(projectId, body), onSuccess: onDetail, ...quiet }),
    remove: useMutation({
      mutationFn: () => projectsApi.delete(projectId),
      onSuccess: () => {
        qc.removeQueries({ queryKey: qk.project(projectId) });
        qc.removeQueries({ queryKey: qk.projectTasks(projectId) });
        void qc.invalidateQueries({ queryKey: ['projects'] });
        void qc.invalidateQueries({ queryKey: qk.myTasks });
      },
      ...quiet,
    }),
    addMember: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) => projectsApi.addMember(projectId, userId, role),
      onSuccess: onDetail,
      ...quiet,
    }),
    updateMember: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) => projectsApi.updateMember(projectId, userId, role),
      onSuccess: onDetail,
      ...quiet,
    }),
    removeMember: useMutation({
      mutationFn: (userId: string) => projectsApi.removeMember(projectId, userId),
      onSuccess: onDetail,
      ...quiet,
    }),
  };
}
