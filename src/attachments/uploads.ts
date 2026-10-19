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
  status: 'uploading' | 'failed';
  /** 0–1 */
  progress: number;
  error: string | null;
  /** false when retrying can't help (the file is over the limit) */
  retryable: boolean;
};

type Entry = { item: UploadItem; file: File; controller: AbortController | null; onUploaded: (a: Attachment) => void };

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
    if (err.status === 429 || err.code === 'RATE_LIMITED') return 'Too many uploads. Try again in a few minutes.';
    if (err.status === 403) return 'You can’t add attachments here.';
  }
  return errorMessage(err, 'Upload failed.');
}

function run(id: string) {
  const e = entries.get(id);
  if (!e) return;
  const controller = new AbortController();
  e.controller = controller;
  update(id, { status: 'uploading', progress: 0, error: null });
  attachmentsApi
    .upload(e.item.taskId, e.file, {
      draft: e.item.draft,
      signal: controller.signal,
      onProgress: (fraction) => {
        // Uploaded isn't stored yet: hold at 99% until the server answers.
        const progress = Math.min(fraction, 0.99);
        if (entries.get(id)?.item.status === 'uploading' && progress - (entries.get(id)?.item.progress ?? 0) >= 0.01) {
          update(id, { progress });
        }
      },
    })
    .then((attachment) => {
      if (!entries.has(id)) return;
      entries.delete(id);
      emit();
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
    status: tooLarge ? 'failed' : 'uploading',
    progress: 0,
    error: tooLarge ? `${file.name || 'This file'} is larger than 100 MB.` : null,
    retryable: !tooLarge,
  };
  entries.set(id, { item, file, controller: null, onUploaded: opts.onUploaded });
  emit();
  if (!tooLarge) run(id);
  return id;
}

/** Stops an upload in flight (or forgets a failed one). */
export function cancelUpload(id: string) {
  const e = entries.get(id);
  if (!e) return;
  entries.delete(id);
  e.controller?.abort();
  emit();
}

/** Stops and forgets every upload of one kind on a task (the composer going away). */
export function cancelUploads(taskId: string, draft: boolean) {
  for (const [id, e] of entries) {
    if (e.item.taskId === taskId && e.item.draft === draft) {
      entries.delete(id);
      e.controller?.abort();
    }
  }
  emit();
}

export function retryUpload(id: string) {
  const e = entries.get(id);
  if (e && e.item.status === 'failed' && e.item.retryable) run(id);
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
