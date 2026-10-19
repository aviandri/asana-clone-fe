import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { attachmentsApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { Attachment, Project, TaskDetail, User } from '@/api/types';
import { startUpload } from './uploads';

/**
 * SPEC §13 delete: the uploader, a workspace ADMIN, or the project OWNER; on a personal task the
 * uploader or the task's creator (A7).
 */
export function canDeleteAttachment(
  a: Pick<Attachment, 'uploader'>,
  task: Pick<TaskDetail, 'projectId' | 'creator'>,
  project: Pick<Project, 'myRole'> | null | undefined,
  me: Pick<User, 'id' | 'role'>,
) {
  if (a.uploader.id === me.id || me.role === 'ADMIN') return true;
  return task.projectId ? project?.myRole === 'OWNER' : task.creator.id === me.id;
}

export function confirmDelete(a: Pick<Attachment, 'kind' | 'name' | 'title' | 'url'>) {
  const name = a.kind === 'LINK' ? (a.title ?? a.url ?? 'this link') : (a.name ?? 'this file');
  return window.confirm(`Delete “${name}”? This can’t be undone.`);
}

/** Attaching (task-level uploads) and deleting, keeping the task, its stories and the lists in step. */
export function useAttachmentActions(task: Pick<TaskDetail, 'id' | 'projectId'>) {
  const qc = useQueryClient();
  const { id: taskId, projectId } = task;

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.task(taskId) });
    void qc.invalidateQueries({ queryKey: qk.stories(taskId) });
    if (projectId) void qc.invalidateQueries({ queryKey: qk.projectTasks(projectId) });
    void qc.invalidateQueries({ queryKey: qk.myTasks });
  }, [qc, taskId, projectId]);

  // Show a new attachment right away, then refetch the truth. (`??`: a server from before §13 sends
  // neither field.)
  const insert = useCallback(
    (a: Attachment) =>
      qc.setQueryData<TaskDetail>(qk.task(taskId), (t) =>
        t && !(t.attachments ?? []).some((x) => x.id === a.id)
          ? { ...t, attachments: [a, ...(t.attachments ?? [])], attachmentCount: (t.attachmentCount ?? 0) + 1 }
          : t,
      ),
    [qc, taskId],
  );

  const attach = useCallback(
    (files: Iterable<File>) => {
      for (const file of files) {
        startUpload(taskId, file, {
          onUploaded: (a) => {
            insert(a);
            refresh();
          },
        });
      }
    },
    [taskId, insert, refresh],
  );

  const remove = useMutation({
    mutationFn: (a: Attachment) => attachmentsApi.delete(a.id),
    onMutate: (a) => {
      qc.setQueryData<TaskDetail>(qk.task(taskId), (t) =>
        t
          ? {
              ...t,
              attachments: (t.attachments ?? []).filter((x) => x.id !== a.id),
              attachmentCount: Math.max(0, (t.attachmentCount ?? 1) - 1),
            }
          : t,
      );
    },
    onSettled: refresh,
  });

  // Errors show in the link form, not as a toast.
  const addLink = useMutation({
    mutationFn: (input: { url: string; title?: string }) => attachmentsApi.addLink(taskId, input),
    meta: { quiet: true },
    onSuccess: (a) => {
      insert(a);
      refresh();
    },
  });

  const refreshPreview = useMutation({
    mutationFn: (a: Attachment) => attachmentsApi.refreshPreview(a.id),
    onSuccess: (a) =>
      qc.setQueryData<TaskDetail>(qk.task(taskId), (t) =>
        t ? { ...t, attachments: (t.attachments ?? []).map((x) => (x.id === a.id ? a : x)) } : t,
      ),
  });

  return { attach, remove, addLink, refreshPreview };
}
