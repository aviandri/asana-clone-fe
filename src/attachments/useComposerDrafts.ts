import { useCallback, useEffect, useRef, useState } from 'react';
import { attachmentsApi } from '@/api/endpoints';
import type { Attachment, TaskDetail } from '@/api/types';
import { cancelUploads, currentUploads, dismissFailedUploads, startUpload, useUploads } from './uploads';

/** §13: a comment takes up to 20 attachments. */
export const MAX_COMMENT_ATTACHMENTS = 20;

export const COMMENT_FULL_MESSAGE = `A comment can have up to ${MAX_COMMENT_ATTACHMENTS} attachments.`;

const forget = (a: Attachment) => void attachmentsApi.delete(a.id).catch(() => undefined);

/**
 * The comment composer's attachments: drafts on the server (uploaded with `?draft=true`, or links
 * with `draft: true`) that only become visible once a comment is posted with their ids.
 *
 * Removing a chip deletes its draft. Leaving the composer (closing the panel, switching task)
 * cancels uploads in flight and deletes the finished drafts, best effort: the server's sweeper
 * removes whatever is left after 24 h (e.g. the tab was closed).
 *
 * Posting is a lifecycle, because attaching stays open while a post is in flight:
 * [beginPost] marks the ids being sent (their chips can't be removed meanwhile), [posted] then
 * drops exactly those (anything added meanwhile stays for the next comment, and is still cleaned
 * up on leaving), and [postFailed] keeps them all.
 */
export function useComposerDrafts(task: Pick<TaskDetail, 'id'>) {
  const taskId = task.id;
  const [drafts, setDrafts] = useState<Attachment[]>([]);
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set());
  const uploads = useUploads(taskId, true);
  // The drafts as of now (not the last render): what leaving deletes, what the limit counts.
  const latest = useRef<Attachment[]>([]);
  const linksInFlight = useRef(0);
  const mounted = useRef(true);

  const setLatest = useCallback((next: (d: Attachment[]) => Attachment[]) => {
    latest.current = next(latest.current);
    setDrafts(latest.current);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelUploads(taskId, true);
      latest.current.forEach(forget);
      latest.current = [];
    };
  }, [taskId]);

  const adopt = useCallback(
    (a: Attachment) => {
      // Finished after the composer went away: nobody will post it.
      if (!mounted.current) return forget(a);
      setLatest((d) => [...d, a]);
    },
    [setLatest],
  );

  /** Free places, counted at call time: drafts, uploads (not failed ones) and links on their way. */
  const room = useCallback(() => {
    const active = currentUploads(taskId, true).filter((u) => u.status !== 'failed').length;
    return Math.max(0, MAX_COMMENT_ATTACHMENTS - latest.current.length - active - linksInFlight.current);
  }, [taskId]);

  const attachFiles = useCallback(
    (files: File[]) => {
      // Over the limit: the extra files are left out (the composer says how many).
      const take = Math.min(files.length, room());
      files.slice(0, take).forEach((file) => startUpload(taskId, file, { draft: true, onUploaded: adopt }));
      return files.length - take;
    },
    [taskId, room, adopt],
  );

  const addLink = useCallback(
    async (input: { url: string; title?: string }) => {
      if (room() === 0) throw new Error(COMMENT_FULL_MESSAGE);
      linksInFlight.current += 1;
      try {
        adopt(await attachmentsApi.addLink(taskId, { ...input, draft: true }));
      } finally {
        linksInFlight.current -= 1;
      }
    },
    [taskId, room, adopt],
  );

  const remove = useCallback(
    (a: Attachment) => {
      // Being posted right now: deleting it would pull it out from under the comment.
      if (sending.has(a.id)) return;
      setLatest((d) => d.filter((x) => x.id !== a.id));
      forget(a);
    },
    [sending, setLatest],
  );

  const beginPost = useCallback((ids: string[]) => setSending(new Set(ids)), []);

  /** The comment is in: its drafts belong to it now, so they mustn't be deleted on leaving. */
  const posted = useCallback(
    (ids: string[]) => {
      const sent = new Set(ids);
      setLatest((d) => d.filter((x) => !sent.has(x.id)));
      setSending(new Set());
      // A failed upload's chip would otherwise linger and look like part of the next comment.
      dismissFailedUploads(taskId, true);
    },
    [taskId, setLatest],
  );

  const postFailed = useCallback(() => setSending(new Set()), []);

  const count = drafts.length + uploads.filter((u) => u.status !== 'failed').length;
  return {
    drafts,
    uploads,
    sending,
    // Queued or in flight: Send waits for them (§13).
    uploading: uploads.some((u) => u.status !== 'failed'),
    full: count >= MAX_COMMENT_ATTACHMENTS,
    attachFiles,
    addLink,
    remove,
    beginPost,
    posted,
    postFailed,
  };
}
