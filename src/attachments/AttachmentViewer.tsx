import { lazy, Suspense, useEffect, useState } from 'react';
import { attachmentUrls } from '@/api/endpoints';
import type { Attachment } from '@/api/types';
import { Modal } from '@/components/Modal';
import { Spinner } from '@/components/Spinner';
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon, TrashIcon } from '@/components/icons';
import { timeAgo } from '@/lib/dates';
import { FileTypeIcon } from './FileTypeIcon';
import { formatBytes, previewKind } from './fileTypes';
import { confirmDelete } from './useAttachments';

// pdf.js is big: only fetched when a PDF is opened.
const PdfViewer = lazy(() => import('./PdfViewer'));

/** Text previews read at most this much (a Range request), so a huge log can't stall the tab. */
const TEXT_PREVIEW_BYTES = 1024 * 1024;
const ZOOMS = [1, 1.5, 2, 3, 4];

function TextPreview({ url, size }: { url: string; size: number | null }) {
  const [state, setState] = useState<{ text: string } | { error: true } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { credentials: 'include', signal: controller.signal, headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` } })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.arrayBuffer();
      })
      .then((buf) => {
        // A cut may split a character: decode leniently (never as HTML; it's put in a <pre>).
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, TEXT_PREVIEW_BYTES));
        setState({ text });
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setState({ error: true });
      });
    return () => controller.abort();
  }, [url]);
  if (!state) return <Spinner />;
  if ('error' in state) return <p className="text-sm text-gray-600">Couldn’t load this file.</p>;
  return (
    <div className="h-full w-full overflow-auto bg-white p-4">
      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-800">{state.text}</pre>
      {(size ?? 0) > TEXT_PREVIEW_BYTES && <p className="mt-3 text-xs text-gray-500">Showing the first 1 MB. Download the file to see all of it.</p>}
    </div>
  );
}

function ImagePreview({ a, url, zoom, onToggleZoom }: { a: Attachment; url: string; zoom: number; onToggleZoom: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="text-sm text-gray-600">Couldn’t load this image.</p>;
  // Fitted, the large thumbnail (≤ 1600 px) is plenty; the original loads only once zoomed in.
  const src = zoom === 1 ? (attachmentUrls.thumbnail(a, 'large') ?? url) : url;
  return (
    <div className="flex h-full w-full overflow-auto">
      <img
        src={src}
        alt={a.name ?? ''}
        onClick={onToggleZoom}
        onError={() => setFailed(true)}
        className={zoom === 1 ? 'm-auto max-h-full max-w-full cursor-zoom-in object-contain' : 'm-auto max-w-none cursor-zoom-out'}
        style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }}
      />
    </div>
  );
}

function NoPreview({ a }: { a: Attachment }) {
  const download = attachmentUrls.download(a);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <FileTypeIcon mimeType={a.mimeType} name={a.name} size="lg" />
      <p className="text-sm text-gray-600">There’s no preview for this type of file.</p>
      {download && (
        <a href={download} download={a.name ?? ''} className="btn-primary">
          <DownloadIcon className="h-4 w-4" /> Download
        </a>
      )}
    </div>
  );
}

/**
 * The in-app preview of a FILE attachment: images (zoom, arrows through the task's images), PDF,
 * video/audio and plain text; anything else gets its type icon and Download. Open in browser,
 * Download and Delete (when allowed) are always there.
 */
function ViewerBody({
  a,
  files,
  onNavigate,
  canDelete,
  onDelete,
}: {
  a: Attachment;
  files: Attachment[];
  onNavigate: (id: string) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const kind = previewKind(a);
  const content = attachmentUrls.content(a);
  const download = attachmentUrls.download(a);
  const images = files.filter((f) => previewKind(f) === 'image');
  const index = kind === 'image' ? images.findIndex((f) => f.id === a.id) : -1;
  const prev = index > 0 ? images[index - 1] : null;
  const next = index >= 0 && index < images.length - 1 ? images[index + 1] : null;
  const [zoom, setZoom] = useState(1);
  const zoomBy = (step: 1 | -1) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + step))]);

  useEffect(() => {
    if (kind !== 'image') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) return;
      if (e.key === 'ArrowLeft' && prev) onNavigate(prev.id);
      else if (e.key === 'ArrowRight' && next) onNavigate(next.id);
      else if (e.key === '+' || e.key === '=') zoomBy(1);
      else if (e.key === '-') zoomBy(-1);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex flex-col px-5 pb-5 pt-2">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>
          {[formatBytes(a.size), a.uploader.name, timeAgo(a.createdAt)].filter(Boolean).join(' · ')}
        </span>
        <div className="flex-1" />
        {kind === 'image' && (
          <span className="flex items-center gap-1" aria-label="Zoom">
            <button type="button" className="btn-ghost px-2 py-1" aria-label="Zoom out" disabled={zoom === ZOOMS[0]} onClick={() => zoomBy(-1)}>
              −
            </button>
            <span aria-live="polite" className="w-10 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" className="btn-ghost px-2 py-1" aria-label="Zoom in" disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => zoomBy(1)}>
              +
            </button>
          </span>
        )}
        {content && (
          <a href={content} target="_blank" rel="noopener noreferrer" className="btn-secondary py-1 text-xs">
            <ExternalLinkIcon className="h-3.5 w-3.5" /> Open in browser
          </a>
        )}
        {download && (
          <a href={download} download={a.name ?? ''} className="btn-secondary py-1 text-xs">
            <DownloadIcon className="h-3.5 w-3.5" /> Download
          </a>
        )}
        {canDelete && (
          <button type="button" className="btn-secondary py-1 text-xs text-red-600" onClick={() => confirmDelete(a) && onDelete()}>
            <TrashIcon className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </div>
      <div className="relative flex h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-gray-50">
        {!content || !kind ? (
          <NoPreview a={a} />
        ) : kind === 'image' ? (
          <ImagePreview a={a} url={content} zoom={zoom} onToggleZoom={() => setZoom((z) => (z === 1 ? 2 : 1))} />
        ) : kind === 'pdf' ? (
          <Suspense fallback={<Spinner />}>
            <PdfViewer url={content} name={a.name ?? 'PDF'} />
          </Suspense>
        ) : kind === 'video' ? (
          <video controls preload="metadata" src={content} className="max-h-full max-w-full">
            Your browser can’t play this video. Use Download instead.
          </video>
        ) : kind === 'audio' ? (
          <div className="flex flex-col items-center gap-4">
            <FileTypeIcon mimeType={a.mimeType} name={a.name} size="lg" />
            <audio controls preload="metadata" src={content} aria-label={a.name ?? 'Audio'} />
          </div>
        ) : (
          <TextPreview url={content} size={a.size} />
        )}
        {prev && (
          <button
            type="button"
            aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
            onClick={() => onNavigate(prev.id)}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        )}
        {next && (
          <button
            type="button"
            aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
            onClick={() => onNavigate(next.id)}
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function AttachmentViewer({
  files,
  viewingId,
  onNavigate,
  onClose,
  canDelete,
  onDelete,
}: {
  files: Attachment[];
  viewingId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
  canDelete: (a: Attachment) => boolean;
  onDelete: (a: Attachment) => void;
}) {
  // Gone (deleted elsewhere, or the task refetched without it): the viewer closes.
  const a = files.find((f) => f.id === viewingId) ?? null;
  return (
    <Modal open={!!a} onClose={onClose} title={a?.name ?? 'Attachment'} className="max-w-5xl">
      {a && <ViewerBody key={a.id} a={a} files={files} onNavigate={onNavigate} canDelete={canDelete(a)} onDelete={() => onDelete(a)} />}
    </Modal>
  );
}
