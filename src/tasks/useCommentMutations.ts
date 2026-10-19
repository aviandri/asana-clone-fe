import { useMutation, useQueryClient } from '@tanstack/react-query';
import { commentsApi, tasksApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { Story, Task } from '@/api/types';

/** Comments change the task's commentCount and followers, so refresh those views too. */
export function useCommentMutations(task: Pick<Task, 'id' | 'projectId'>) {
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
    mutationFn: ({ body, attachmentIds = [] }: { body: string; attachmentIds?: string[] }) =>
      tasksApi.addComment(task.id, body, attachmentIds),
    onSuccess: appendStory,
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
