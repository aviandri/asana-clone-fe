import type { Attachment } from '@/api/types';
import { LinkIcon, XIcon } from '@/components/icons';
import { FileTypeIcon } from './FileTypeIcon';
import { formatBytes, hostOf } from './fileTypes';
import { cancelUpload, retryUpload, type UploadItem } from './uploads';

function DraftChip({ a, onRemove }: { a: Attachment; onRemove: () => void }) {
  const name = a.kind === 'LINK' ? a.title || hostOf(a.url) || 'Link' : (a.name ?? 'file');
  return (
    <li className="flex max-w-[16rem] items-center gap-1.5 rounded-full border border-gray-200 bg-white py-0.5 pl-1 pr-1.5 text-xs">
      {a.kind === 'LINK' ? (
        <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <LinkIcon className="h-3 w-3" />
        </span>
      ) : (
        <FileTypeIcon mimeType={a.mimeType} name={a.name} size="sm" />
      )}
      <span className="min-w-0 truncate">{name}</span>
      {a.kind !== 'LINK' && <span className="shrink-0 text-gray-500">{formatBytes(a.size)}</span>}
      <button type="button" aria-label={`Remove ${name}`} className="shrink-0 rounded-full p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800" onClick={onRemove}>
        <XIcon className="h-3 w-3" />
      </button>
    </li>
  );
}

function UploadChip({ u }: { u: UploadItem }) {
  const pct = Math.round(u.progress * 100);
  return (
    <li className="flex max-w-[18rem] items-center gap-1.5 rounded-full border border-gray-200 bg-white py-0.5 pl-1 pr-1.5 text-xs">
      <FileTypeIcon mimeType={null} name={u.name} size="sm" />
      <span className="min-w-0 truncate">{u.name}</span>
      {u.status === 'uploading' ? (
        <>
          <span
            role="progressbar"
            aria-label={`Uploading ${u.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-1.5 w-12 shrink-0 overflow-hidden rounded bg-gray-200"
          >
            <span className="block h-full bg-primary-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </span>
          <button type="button" aria-label={`Cancel uploading ${u.name}`} className="shrink-0 rounded-full p-0.5 text-gray-500 hover:bg-gray-100" onClick={() => cancelUpload(u.id)}>
            <XIcon className="h-3 w-3" />
          </button>
        </>
      ) : (
        <>
          <span role="alert" className="min-w-0 truncate text-red-600" title={u.error ?? undefined}>
            {u.error}
          </span>
          {u.retryable && (
            <button type="button" aria-label={`Retry uploading ${u.name}`} className="shrink-0 font-medium text-primary-700 hover:underline" onClick={() => retryUpload(u.id)}>
              Retry
            </button>
          )}
          <button type="button" aria-label={`Dismiss ${u.name}`} className="shrink-0 rounded-full p-0.5 text-gray-500 hover:bg-gray-100" onClick={() => cancelUpload(u.id)}>
            <XIcon className="h-3 w-3" />
          </button>
        </>
      )}
    </li>
  );
}

/** The composer's attachment chips: finished drafts (removable) and uploads (progress, cancel, retry). */
export function ComposerAttachments({
  drafts,
  uploads,
  onRemove,
}: {
  drafts: Attachment[];
  uploads: UploadItem[];
  onRemove: (a: Attachment) => void;
}) {
  if (drafts.length === 0 && uploads.length === 0) return null;
  return (
    <ul aria-label="Comment attachments" className="mt-2 flex flex-wrap gap-1.5">
      {drafts.map((a) => (
        <DraftChip key={a.id} a={a} onRemove={() => onRemove(a)} />
      ))}
      {uploads.map((u) => (
        <UploadChip key={u.id} u={u} />
      ))}
    </ul>
  );
}
