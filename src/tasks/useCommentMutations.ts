import { useMutation, useQueryClient } from '@tanstack/react-query';
import { commentsApi, tasksApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { Story, Task } from '@/api/types';

type AddVars = { body: string; attachmentIds?: string[] };

/**
 * Comments change the task's commentCount and followers, so refresh those views too.
 *
 * [onAdded]/[onAddFailed] run even if the caller unmounted mid-post (unlike mutate()'s own
 * callbacks), for state that outlives the component, like the composer's draft attachments.
 */
export function useCommentMutations(
  task: Pick<Task, 'id' | 'projectId'>,
  hooks: { onAdded?: (vars: AddVars) => void; onAddFailed?: (vars: AddVars) => void } = {},
) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.stories(task.id) });
    void qc.invalidateQueries({ queryKey: qk.task(task.id) });
    if (task.projectId) void qc.invalidateQueries({ queryKey: qk.projectTasks(task.projectId) });
    void qc.invalidateQueries({ queryKey: qk.myTasks });
  };
  const appendStory = (s: Story) =>
    qc.setQueryData<Story[]>(qk.stories(task.id), (list) => (list ? [...list, s] : list));
  const replaceStory = (s: Story) =>
    qc.setQueryData<Story[]>(qk.stories(task.id), (list) => list?.map((x) => (x.id === s.id ? s : x)));

  const add = useMutation({
    mutationFn: ({ body, attachmentIds = [] }: AddVars) => tasksApi.addComment(task.id, body, attachmentIds),
    onSuccess: (s, vars) => {
      appendStory(s);
      hooks.onAdded?.(vars);
    },
    onError: (_err, vars) => hooks.onAddFailed?.(vars),
    onSettled: refresh,
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => commentsApi.update(id, body),
    onSuccess: replaceStory,
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => commentsApi.delete(id),
    onMutate: (id) => qc.setQueryData<Story[]>(qk.stories(task.id), (list) => list?.filter((x) => x.id !== id)),
    onSettled: refresh,
  });
  return { add, edit, remove };
}
