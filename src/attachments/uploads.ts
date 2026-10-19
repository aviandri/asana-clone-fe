import { useSyncExternalStore } from 'react';
import { ApiError } from '@/api/client';
import { attachmentsApi } from '@/api/endpoints';
import type { Attachment } from '@/api/types';
import { isAbort } from '@/api/upload';
import { errorMessage } from '@/lib/errors';
import { MAX_UPLOAD_BYTES } from './fileTypes';

/** One file on its way up, as the UI shows it. Finished uploads leave the list (the task has them). */
export type UploadItem = {
  id: string;
  taskId: string;
  draft: boolean;
  name: string;
  size: number;
  /** queued: waiting for one of the 3 upload slots (§13 A12) */
  status: 'queued' | 'uploading' | 'failed';
  /** 0–1 */
  progress: number;
  /**
   * The whole body is sent and the server is storing it. It can't be cancelled any more: the
   * server would commit it anyway, and the UI would show a cancel that didn't happen.
   */
  finishing: boolean;
  error: string | null;
  /** false when retrying can't help (the file is over the limit) */
  retryable: boolean;
};

type Entry = {
  item: UploadItem;
  file: File;
  controller: AbortController | null;
  onUploaded: (a: Attachment) => void;
  /** Dropped from the list while finishing: still hand over the result (the owner decides). */
  detached?: boolean;
};

// Module state, not component state: an upload keeps going (and stays listed) if the task panel
// closes or switches tasks, and shows up again when that task reopens.
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: UploadItem[] = [];
let nextId = 1;

function emit() {
  snapshot = [...entries.values()].map((e) => e.item);
  listeners.forEach((l) => l());
}

function update(id: string, patch: Partial<UploadItem>) {
  const e = entries.get(id);
  if (!e) return;
  e.item = { ...e.item, ...patch };
  emit();
}

export function uploadErrorMessage(err: unknown, name: string): string {
  if (err instanceof ApiError) {
    if (err.status === 413 || err.code === 'PAYLOAD_TOO_LARGE') return `${name} is larger than 100 MB.`;
    // A12: the server says which limit (concurrent uploads, unposted drafts); show its words.
    if (err.status === 429 || err.code === 'RATE_LIMITED') return err.message || 'Too many uploads. Try again in a few minutes.';
    if (err.status === 507 || err.code === 'INSUFFICIENT_STORAGE') return err.message || 'The server is out of storage space. Try again later.';
    if (err.status === 403) return 'You can’t add attachments here.';
  }
  return errorMessage(err, 'Upload failed.');
}

/** §13 A12: the server allows 3 concurrent uploads per user, so the client sends at most 3 and queues the rest. */
export const MAX_CONCURRENT_UPLOADS = 3;
let active = 0;

/** Starts queued uploads, oldest first, while there's a free slot. */
function pump() {
  for (const [id, e] of entries) {
    if (active >= MAX_CONCURRENT_UPLOADS) return;
    if (e.item.status === 'queued') run(id);
  }
}

function run(id: string) {
  const e = entries.get(id);
  if (!e) return;
  active += 1;
  let settled = false;
  const release = () => {
    if (settled) return;
    settled = true;
    active -= 1;
    pump();
  };
  const controller = new AbortController();
  // Aborting frees the slot at once (the request is gone); the rejection that follows is ignored.
  controller.signal.addEventListener('abort', release, { once: true });
  e.controller = controller;
  update(id, { status: 'uploading', progress: 0, error: null, finishing: false });
  attachmentsApi
    .upload(e.item.taskId, e.file, {
      draft: e.item.draft,
      signal: controller.signal,
      onProgress: (fraction) => {
        const current = entries.get(id)?.item;
        if (current?.status !== 'uploading') return;
        // Sent isn't stored: hold at 99% ("Finishing…") until the server answers.
        if (fraction >= 1) {
          if (!current.finishing) update(id, { progress: 0.99, finishing: true });
        } else if (fraction - current.progress >= 0.01) {
          update(id, { progress: fraction });
        }
      },
    })
    .finally(release)
    .then((attachment) => {
      if (!entries.has(id) && !e.detached) return;
      if (entries.delete(id)) emit();
      e.onUploaded(attachment);
    })
    .catch((err: unknown) => {
      if (!entries.has(id) || isAbort(err)) return;
      const tooLarge = err instanceof ApiError && (err.status === 413 || err.code === 'PAYLOAD_TOO_LARGE');
      e.controller = null;
      update(id, { status: 'failed', error: uploadErrorMessage(err, e.item.name), retryable: !tooLarge });
    });
}

/**
 * Starts uploading [file] to a task. Files over 100 MB are listed as failed straight away (SPEC §13:
 * checked before upload), without a request.
 */
export function startUpload(
  taskId: string,
  file: File,
  opts: { draft?: boolean; onUploaded: (a: Attachment) => void },
): string {
  const id = `upload-${nextId++}`;
  const tooLarge = file.size > MAX_UPLOAD_BYTES;
  const item: UploadItem = {
    id,
    taskId,
    draft: !!opts.draft,
    name: file.name || 'file',
    size: file.size,
    status: tooLarge ? 'failed' : 'queued',
    progress: 0,
    finishing: false,
    error: tooLarge ? `${file.name || 'This file'} is larger than 100 MB.` : null,
    retryable: !tooLarge,
  };
  entries.set(id, { item, file, controller: null, onUploaded: opts.onUploaded });
  emit();
  if (!tooLarge) pump();
  return id;
}

function drop(e: Entry, id: string) {
  entries.delete(id);
  // Too late to stop a finishing upload: let it land and hand it over, so it shows (or, for a
  // composer that's gone, gets deleted) instead of silently existing on the server.
  if (e.item.finishing) e.detached = true;
  else e.controller?.abort();
}

/** Stops an upload in flight (or forgets a failed one). A finishing upload completes anyway. */
export function cancelUpload(id: string) {
  const e = entries.get(id);
  if (!e) return;
  drop(e, id);
  emit();
}

/** Stops and forgets every upload of one kind on a task (the composer going away). */
export function cancelUploads(taskId: string, draft: boolean) {
  for (const [id, e] of entries) {
    if (e.item.taskId === taskId && e.item.draft === draft) drop(e, id);
  }
  emit();
}

export function retryUpload(id: string) {
  const e = entries.get(id);
  if (!e || e.item.status !== 'failed' || !e.item.retryable) return;
  update(id, { status: 'queued', progress: 0, error: null });
  pump();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The task's uploads (task-level or the composer's drafts), oldest first. */
export function useUploads(taskId: string, draft = false): UploadItem[] {
  const all = useSyncExternalStore(subscribe, () => snapshot);
  return all.filter((u) => u.taskId === taskId && u.draft === draft);
}

/** Tests: drop everything (aborting what's in flight). */
export function resetUploads() {
  if (entries.size === 0) return;
  entries.forEach((e) => e.controller?.abort());
  entries.clear();
  emit();
}
