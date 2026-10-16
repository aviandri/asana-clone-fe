import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { goalsApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type {
  CreateGoalInput,
  CreateKeyResultInput,
  GoalDetail,
  GoalStatus,
  KeyResult,
  UpdateGoalInput,
  UpdateKeyResultInput,
} from '@/api/types';
import { krProgressOf } from '@/lib/goals';

export function useGoals(timePeriod?: string) {
  return useQuery({
    queryKey: qk.goals({ timePeriod }),
    queryFn: () => goalsApi.list({ timePeriod }).then((r) => r.data),
  });
}
export function useGoal(id: string | undefined) {
  return useQuery({ queryKey: qk.goal(id ?? ''), queryFn: () => goalsApi.get(id!), enabled: !!id });
}
export function useTimePeriods() {
  return useQuery({ queryKey: qk.timePeriods, queryFn: () => goalsApi.timePeriods().then((r) => r.data), staleTime: 5 * 60_000 });
}
export function useGoalUpdates(id: string) {
  return useQuery({ queryKey: qk.goalUpdates(id), queryFn: () => goalsApi.updates(id).then((r) => r.data) });
}

/** Progress rolls up the cascade, so any goal write refreshes every goal query. */
function refreshGoals(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['goals'] });
  void qc.invalidateQueries({ queryKey: ['goal'] });
  void qc.invalidateQueries({ queryKey: qk.timePeriods });
}

// Inline errors are rendered by the goal UI, so these skip the global toast.
const quiet = { meta: { quiet: true } };

export function useGoalMutations(id?: string) {
  const qc = useQueryClient();
  const setDetail = (g: GoalDetail) => qc.setQueryData(qk.goal(g.id), g);
  return {
    create: useMutation({
      mutationFn: (body: CreateGoalInput) => goalsApi.create(body),
      onSuccess: setDetail,
      onSettled: () => refreshGoals(qc),
      ...quiet,
    }),
    update: useMutation({
      mutationFn: (body: UpdateGoalInput) => goalsApi.update(id!, body),
      onSuccess: setDetail,
      onSettled: () => refreshGoals(qc),
      ...quiet,
    }),
    remove: useMutation({
      mutationFn: () => goalsApi.delete(id!),
      onSuccess: () => qc.removeQueries({ queryKey: qk.goal(id!) }),
      onSettled: () => refreshGoals(qc),
      ...quiet,
    }),
    linkProject: useMutation({
      mutationFn: (projectId: string) => goalsApi.linkProject(id!, projectId),
      onSuccess: setDetail,
      onSettled: () => refreshGoals(qc),
      ...quiet,
    }),
    unlinkProject: useMutation({
      mutationFn: (projectId: string) => goalsApi.unlinkProject(id!, projectId),
      onSuccess: setDetail,
      onSettled: () => refreshGoals(qc),
      ...quiet,
    }),
    postUpdate: useMutation({
      mutationFn: (body: { status: GoalStatus; body?: string | null }) => goalsApi.postUpdate(id!, body),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: qk.goalUpdates(id!) });
      },
      onSettled: () => refreshGoals(qc),
      ...quiet,
    }),
  };
}

/** Apply a KR change to the cached goal detail (and its KEY_RESULTS progress) optimistically. */
function patchKrInDetail(qc: QueryClient, goalId: string, krId: string, patch: Partial<KeyResult>) {
  qc.setQueryData<GoalDetail>(qk.goal(goalId), (g) => {
    if (!g) return g;
    const keyResults = g.keyResults.map((k) => {
      if (k.id !== krId) return k;
      const next = { ...k, ...patch };
      return { ...next, progress: krProgressOf(next) };
    });
    const progress =
      g.progressSource === 'KEY_RESULTS' && keyResults.length
        ? Math.round((keyResults.reduce((n, k) => n + k.progress, 0) / keyResults.length) * 10) / 10
        : g.progress;
    return { ...g, keyResults, progress };
  });
}

export function useKeyResultMutations(goalId: string) {
  const qc = useQueryClient();
  return {
    add: useMutation({
      mutationFn: (body: CreateKeyResultInput) => goalsApi.addKeyResult(goalId, body),
      onSettled: () => refreshGoals(qc),
      ...quiet,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: UpdateKeyResultInput & { id: string }) => goalsApi.updateKeyResult(id, body),
      onMutate: async ({ id, ...body }) => {
        await qc.cancelQueries({ queryKey: qk.goal(goalId) });
        const snapshot = qc.getQueryData<GoalDetail>(qk.goal(goalId));
        patchKrInDetail(qc, goalId, id, body as Partial<KeyResult>);
        return { snapshot };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.snapshot) qc.setQueryData(qk.goal(goalId), ctx.snapshot);
      },
      onSuccess: (kr) => patchKrInDetail(qc, goalId, kr.id, kr),
      onSettled: () => refreshGoals(qc),
      ...quiet,
    }),
    remove: useMutation({
      mutationFn: (id: string) => goalsApi.deleteKeyResult(id),
      onMutate: (id) =>
        qc.setQueryData<GoalDetail>(qk.goal(goalId), (g) => (g ? { ...g, keyResults: g.keyResults.filter((k) => k.id !== id) } : g)),
      onSettled: () => refreshGoals(qc),
      ...quiet,
    }),
  };
}
