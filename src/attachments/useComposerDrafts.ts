import { useCallback, useEffect, useRef, useState } from 'react';
import { attachmentsApi } from '@/api/endpoints';
import type { Attachment, TaskDetail } from '@/api/types';
import { cancelUploads, startUpload, useUploads } from './uploads';

/** §13: a comment takes up to 20 attachments. */
export const MAX_COMMENT_ATTACHMENTS = 20;

const forget = (a: Attachment) => void attachmentsApi.delete(a.id).catch(() => undefined);

/**
 * The comment composer's attachments: drafts on the server (uploaded with `?draft=true`, or links
 * with `draft: true`) that only become visible once a comment is posted with their ids.
 *
 * Removing a chip deletes its draft. Leaving the composer (closing the panel, switching task)
 * cancels uploads in flight and deletes the finished drafts, best effort: the server's sweeper
 * removes whatever is left after 24 h (e.g. the tab was closed).
 */
export function useComposerDrafts(task: Pick<TaskDetail, 'id'>) {
  const taskId = task.id;
  const [drafts, setDrafts] = useState<Attachment[]>([]);
  const uploads = useUploads(taskId, true);
  const latest = useRef<Attachment[]>([]);
  latest.current = drafts;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelUploads(taskId, true);
      latest.current.forEach(forget);
    };
  }, [taskId]);

  const adopt = useCallback((a: Attachment) => {
    // Finished after the composer went away: nobody will post it.
    if (!mounted.current) return forget(a);
    setDrafts((d) => [...d, a]);
  }, []);

  const count = drafts.length + uploads.length;
  const room = Math.max(0, MAX_COMMENT_ATTACHMENTS - count);

  const attachFiles = useCallback(
    (files: File[]) => {
      // Over the limit: the extra files are left out (the chips show what's attached).
      files.slice(0, room).forEach((file) => startUpload(taskId, file, { draft: true, onUploaded: adopt }));
      return files.length - Math.min(files.length, room);
    },
    [taskId, room, adopt],
  );

  const addLink = useCallback(
    (input: { url: string; title?: string }) => attachmentsApi.addLink(taskId, { ...input, draft: true }).then(adopt),
    [taskId, adopt],
  );

  const remove = useCallback((a: Attachment) => {
    setDrafts((d) => d.filter((x) => x.id !== a.id));
    forget(a);
  }, []);

  /** After posting: they belong to the comment now, so they mustn't be deleted on leaving. */
  const posted = useCallback(() => {
    latest.current = [];
    setDrafts([]);
  }, []);

  return {
    drafts,
    uploads,
    // Queued or in flight: Send waits for them (§13).
    uploading: uploads.some((u) => u.status !== 'failed'),
    full: room === 0,
    attachFiles,
    addLink,
    remove,
    posted,
  };
}
