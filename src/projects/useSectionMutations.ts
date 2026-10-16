import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sectionsApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { ProjectDetail, Section } from '@/api/types';

function patchSections(qc: ReturnType<typeof useQueryClient>, projectId: string, fn: (s: Section[]) => Section[]) {
  qc.setQueryData<ProjectDetail>(qk.project(projectId), (p) =>
    p ? { ...p, sections: fn(p.sections).sort((a, b) => a.position - b.position) } : p,
  );
}

export function useSectionMutations(projectId: string) {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: qk.project(projectId) });
  };
  const create = useMutation({
    mutationFn: (body: { name: string; position?: number }) => sectionsApi.create(projectId, body),
    onSuccess: (s) => patchSections(qc, projectId, (list) => [...list, s]),
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; position?: number }) => sectionsApi.update(id, body),
    onMutate: ({ id, ...body }) => patchSections(qc, projectId, (list) => list.map((s) => (s.id === id ? { ...s, ...body } : s))),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (id: string) => sectionsApi.delete(id),
    onMutate: (id) => patchSections(qc, projectId, (list) => list.filter((s) => s.id !== id)),
    onSettled: () => {
      settle();
      // Tasks of a deleted section move to "no section".
      void qc.invalidateQueries({ queryKey: qk.projectTasks(projectId) });
    },
  });
  return { create, update, remove };
}
