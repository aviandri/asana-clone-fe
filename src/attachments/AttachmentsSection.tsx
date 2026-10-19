import clsx from 'clsx';
import { useRef, useState } from 'react';
import { attachmentUrls } from '@/api/endpoints';
import type { Attachment, Project, TaskDetail } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Popover } from '@/components/Popover';
import { DotsIcon, LinkIcon, PaperclipIcon } from '@/components/icons';
import { FileTypeIcon } from './FileTypeIcon';
import { attachmentLabel, formatBytes, isHttpUrl, previewKind } from './fileTypes';
import { cancelUpload, retryUpload, useUploads, type UploadItem } from './uploads';
import { LinkCard } from './LinkCard';
import { LinkForm } from './LinkForm';
import { canDeleteAttachment, confirmDelete, useAttachmentActions } from './useAttachments';
import { useOpenAttachment } from './viewerContext';

/** Images this small are shown from the file itself when the server made no thumbnail (BMP, A4). */
const INLINE_THUMB_MAX_BYTES = 5 * 1024 * 1024;

function thumbnailFor(a: Attachment): string | null {
  const thumb = attachmentUrls.thumbnail(a, 'small');
  if (thumb) return thumb;
  if (previewKind(a) === 'image' && (a.size ?? Infinity) <= INLINE_THUMB_MAX_BYTES) return attachmentUrls.content(a);
  return null;
}

const menuItem = 'block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100';

function AttachmentMenu({
  a,
  canDelete,
  onDelete,
  onRefresh,
}: {
  a: Attachment;
  canDelete: boolean;
  onDelete: () => void;
  /** LINK previews, for those who can edit the task */
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const label = a.kind === 'LINK' ? (a.title ?? a.url ?? 'link') : (a.name ?? 'file');
  const content = attachmentUrls.content(a);
  const download = attachmentUrls.download(a);
  const link = isHttpUrl(a.url) ? a.url : null;
  return (
    <span className="absolute right-1 top-1">
      <button
        type="button"
        aria-label={`More actions for ${label}`}
        className="rounded bg-white/90 p-1 text-gray-600 opacity-0 shadow-sm hover:text-gray-900 focus:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <DotsIcon className="h-4 w-4" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="right" className="w-44">
        {a.kind === 'FILE' && content && (
          <a href={content} target="_blank" rel="noopener noreferrer" className={menuItem} onClick={() => setOpen(false)}>
            Open in browser
          </a>
        )}
        {a.kind === 'FILE' && download && (
          <a href={download} download={a.name ?? ''} className={menuItem} onClick={() => setOpen(false)}>
            Download
          </a>
        )}
        {link && (
          <>
            <a href={link} target="_blank" rel="noopener noreferrer nofollow" className={menuItem} onClick={() => setOpen(false)}>
              Open in browser
            </a>
            <button
              type="button"
              className={menuItem}
              onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
            >
              {copied ? 'Link copied!' : 'Copy link'}
            </button>
            {onRefresh && (
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  setOpen(false);
                  onRefresh();
                }}
              >
                Refresh preview
              </button>
            )}
          </>
        )}
        {canDelete && (
          <button
            type="button"
            className={clsx(menuItem, 'text-red-600')}
            onClick={() => {
              setOpen(false);
              if (confirmDelete(a)) onDelete();
            }}
          >
            Delete
          </button>
        )}
      </Popover>
    </span>
  );
}

export function FileTile({ a, onOpen }: { a: Attachment; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const thumb = broken ? null : thumbnailFor(a);
  return (
    <button
      type="button"
      aria-label={attachmentLabel(a)}
      onClick={onOpen}
      className="block w-full overflow-hidden rounded-lg border border-gray-200 text-left hover:border-gray-300"
    >
      <span className="flex h-20 items-center justify-center overflow-hidden bg-gray-50">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <FileTypeIcon mimeType={a.mimeType} name={a.name} />
        )}
      </span>
      <span className="block px-2 py-1.5">
        <span className="block truncate text-xs font-medium text-gray-800">{a.name}</span>
        <span className="block truncate text-[11px] text-gray-500">{formatBytes(a.size)}</span>
      </span>
    </button>
  );
}

export function UploadRow({ u }: { u: UploadItem }) {
  const pct = Math.round(u.progress * 100);
  return (
    <li className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
      <FileTypeIcon mimeType={null} name={u.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <span className="font-medium text-gray-800">{u.name}</span> <span className="text-gray-500">{formatBytes(u.size)}</span>
        </p>
        {u.status === 'uploading' ? (
          <div
            role="progressbar"
            aria-label={`Uploading ${u.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-1 h-1.5 overflow-hidden rounded bg-gray-200"
          >
            <div className="h-full rounded bg-primary-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        ) : (
          <p role="alert" className="mt-0.5 text-red-600">
            {u.error}
          </p>
        )}
      </div>
      {u.status === 'uploading' ? (
        <button type="button" className="btn-ghost px-2 py-1 text-xs" aria-label={`Cancel uploading ${u.name}`} onClick={() => cancelUpload(u.id)}>
          Cancel
        </button>
      ) : (
        <>
          {u.retryable && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" aria-label={`Retry uploading ${u.name}`} onClick={() => retryUpload(u.id)}>
              Retry
            </button>
          )}
          <button type="button" className="btn-ghost px-2 py-1 text-xs" aria-label={`Dismiss ${u.name}`} onClick={() => cancelUpload(u.id)}>
            Dismiss
          </button>
        </>
      )}
    </li>
  );
}

/**
 * The task's attachments (task-level and from comments, newest first) with Attach file, uploads in
 * progress, the in-app viewer and per-item actions (SPEC §13 Clients).
 */
export function AttachmentsSection({
  task,
  project,
  canEdit,
}: {
  task: TaskDetail;
  project: Project | null | undefined;
  canEdit: boolean;
}) {
  const me = useCurrentUser();
  const { attach, remove, addLink, refreshPreview } = useAttachmentActions(task);
  const uploads = useUploads(task.id);
  const input = useRef<HTMLInputElement>(null);
  const open = useOpenAttachment();
  const [addingLink, setAddingLink] = useState(false);
  const attachments = task.attachments ?? [];
  const canDelete = (a: Attachment) => canDeleteAttachment(a, task, project, me);

  if (!canEdit && attachments.length === 0 && uploads.length === 0) return null;

  return (
    <section aria-label="Attachments" className="mt-6">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Attachments
          {attachments.length > 0 && <span className="ml-1.5 font-normal text-gray-500">{attachments.length}</span>}
        </h3>
        <div className="flex-1" />
        {canEdit && (
          <>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" aria-expanded={addingLink} onClick={() => setAddingLink((v) => !v)}>
              <LinkIcon className="h-3.5 w-3.5" /> Add link
            </button>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => input.current?.click()}>
              <PaperclipIcon className="h-3.5 w-3.5" /> Attach file
            </button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              aria-label="Choose files to attach"
              onChange={(e) => {
                const picked = [...(e.target.files ?? [])];
                e.target.value = ''; // the same file can be picked again
                if (picked.length) attach(picked);
              }}
            />
          </>
        )}
      </div>

      {addingLink && (
        <div className="mb-2">
          <LinkForm
            onCancel={() => setAddingLink(false)}
            onSubmit={(input) => addLink.mutateAsync(input).then(() => setAddingLink(false))}
          />
        </div>
      )}

      {uploads.length > 0 && (
        <ul aria-label="Uploads" className="mb-2 space-y-1.5">
          {uploads.map((u) => (
            <UploadRow key={u.id} u={u} />
          ))}
        </ul>
      )}

      {attachments.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="group relative">
              {a.kind === 'FILE' ? (
                <FileTile a={a} onOpen={() => open(a.id)} />
              ) : a.kind === 'LINK' ? (
                <LinkCard a={a} />
              ) : (
                <div aria-label="Attachment" className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                  Unsupported attachment
                </div>
              )}
              {(a.kind === 'FILE' || a.kind === 'LINK' || canDelete(a)) && (
                <AttachmentMenu
                  a={a}
                  canDelete={canDelete(a)}
                  onDelete={() => remove.mutate(a)}
                  onRefresh={a.kind === 'LINK' && canEdit ? () => refreshPreview.mutate(a) : undefined}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        uploads.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-center text-xs text-gray-500">
            Drop files here, paste a screenshot, or use Attach file or Add link.
          </p>
        )
      )}

    </section>
  );
}
