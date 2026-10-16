import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { CreateTaskInput, Task, TaskDetail, UpdateTaskInput, UserSummary } from '@/api/types';

type TaskList = Task[];

/** Apply `fn` to every cached copy of a task (lists, detail, and as a subtask of its parent). */
function patchCachedTask(qc: QueryClient, id: string, fn: (t: Task) => Task) {
  const mapList = (list: TaskList | undefined) => list?.map((t) => (t.id === id ? fn(t) : t));
  qc.setQueriesData<TaskList>({ queryKey: ['projectTasks'] }, mapList);
  qc.setQueriesData<TaskList>({ queryKey: qk.myTasks }, mapList);
  qc.setQueriesData<TaskDetail>({ queryKey: ['task'] }, (d) => {
    if (!d) return d;
    if (d.id === id) return { ...d, ...fn(d) };
    if (d.subtasks.some((s) => s.id === id)) return { ...d, subtasks: d.subtasks.map((s) => (s.id === id ? fn(s) : s)) };
    return d;
  });
}

/** Build the optimistic task fields that follow from a PATCH body. */
export function optimisticFields(patch: UpdateTaskInput, assignee?: UserSummary | null): Partial<Task> {
  const { assigneeId, ...rest } = patch;
  const out: Partial<Task> = { ...rest };
  if (assigneeId !== undefined) out.assignee = assigneeId === null ? null : (assignee ?? null);
  if (patch.completed !== undefined) out.completedAt = patch.completed ? new Date().toISOString() : null;
  return out;
}

function invalidateTaskViews(qc: QueryClient, task: Pick<Task, 'id' | 'projectId' | 'parentId'>) {
  if (task.projectId) void qc.invalidateQueries({ queryKey: qk.projectTasks(task.projectId) });
  void qc.invalidateQueries({ queryKey: qk.myTasks });
  void qc.invalidateQueries({ queryKey: qk.stories(task.id) });
  if (task.parentId) void qc.invalidateQueries({ queryKey: qk.task(task.parentId) });
}

export type UpdateTaskVars = {
  id: string;
  patch: UpdateTaskInput;
  /** Full user object for optimistic display when `patch.assigneeId` is set. */
  assignee?: UserSummary | null;
};

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateTaskVars) => tasksApi.update(id, patch),
    onMutate: async ({ id, patch, assignee }) => {
      await qc.cancelQueries({ queryKey: ['projectTasks'] });
      await qc.cancelQueries({ queryKey: qk.myTasks });
      await qc.cancelQueries({ queryKey: ['task'] });
      const snapshot = qc.getQueriesData({ predicate: (q) => ['projectTasks', 'myTasks', 'task'].includes(String(q.queryKey[0])) });
      const fields = optimisticFields(patch, assignee);
      patchCachedTask(qc, id, (t) => ({ ...t, ...fields }));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), task);
      const { followers: _f, subtasks: _s, parent: _p, ...plain } = task;
      patchCachedTask(qc, task.id, () => plain);
    },
    onSettled: (task, _err, vars) => {
      if (task) invalidateTaskViews(qc, task);
      else void qc.invalidateQueries({ queryKey: ['projectTasks'] });
      // A move to another project changes both lists.
      if (vars.patch.projectId !== undefined) void qc.invalidateQueries({ queryKey: ['projectTasks'] });
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), task);
      if (task.projectId && !task.parentId) {
        const { followers: _f, subtasks: _s, parent: _p, ...plain } = task;
        qc.setQueryData<TaskList>(qk.projectTasks(task.projectId), (list) => (list ? [...list, plain] : list));
      }
      invalidateTaskViews(qc, task);
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: Pick<Task, 'id' | 'projectId' | 'parentId'>) => tasksApi.delete(task.id),
    onMutate: (task) => {
      const drop = (list: TaskList | undefined) => list?.filter((t) => t.id !== task.id);
      qc.setQueriesData<TaskList>({ queryKey: ['projectTasks'] }, drop);
      qc.setQueriesData<TaskList>({ queryKey: qk.myTasks }, drop);
    },
    onSettled: (_r, _e, task) => {
      qc.removeQueries({ queryKey: qk.task(task.id) });
      invalidateTaskViews(qc, task);
    },
  });
}

export function useFollowTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId, follow }: { id: string; userId: string; follow: boolean }) =>
      follow ? tasksApi.addFollower(id, userId) : tasksApi.removeFollower(id, userId),
    onSuccess: (task) => qc.setQueryData(qk.task(task.id), task),
  });
}
