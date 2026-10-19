import type { Attachment } from '@/api/types';

/** SPEC §13 A1: 100 MB = 104,857,600 bytes; the server's MAX_UPLOAD_BYTES default. */
export const MAX_UPLOAD_BYTES = 104_857_600;

/** "2.3 MB" (binary units, like the limit: 100 MB = 100 × 1024²). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)} ${units[unit]}`;
}

export type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text';

// Exactly the server's `inline` allowlist (SPEC §13 Serving): everything else is served as a
// download, so there's nothing to show in-app.
const INLINE: Record<string, PreviewKind> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/avif': 'image',
  'image/bmp': 'image',
  'application/pdf': 'pdf',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'text/plain': 'text',
};

/** What the in-app viewer can show for a FILE attachment; null = type icon + actions only. */
export function previewKind(a: Pick<Attachment, 'kind' | 'mimeType' | 'contentPath'>): PreviewKind | null {
  if (a.kind !== 'FILE' || !a.contentPath || !a.mimeType) return null;
  return INLINE[a.mimeType.split(';')[0].trim().toLowerCase()] ?? null;
}

export type FileFamily =
  | 'image'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'text'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'code'
  | 'file';

const BY_EXTENSION: Record<string, FileFamily> = {
  doc: 'document', docx: 'document', odt: 'document', rtf: 'document', pages: 'document',
  xls: 'spreadsheet', xlsx: 'spreadsheet', ods: 'spreadsheet', csv: 'spreadsheet', numbers: 'spreadsheet',
  ppt: 'presentation', pptx: 'presentation', odp: 'presentation', key: 'presentation',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', tgz: 'archive',
  js: 'code', ts: 'code', json: 'code', html: 'code', css: 'code', xml: 'code', py: 'code', sh: 'code', svg: 'code',
  txt: 'text', md: 'text', log: 'text',
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', heic: 'image', avif: 'image', bmp: 'image', tiff: 'image',
  mp4: 'video', mov: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio',
};

export function extensionOf(name: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name ?? '');
  return m ? m[1].toLowerCase() : '';
}

/** For the type icon: by the sniffed mime type first, then the extension. */
export function fileFamily(mimeType: string | null | undefined, name: string | null | undefined): FileFamily {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return BY_EXTENSION[extensionOf(name)] ?? (mime === 'text/plain' ? 'text' : 'file');
}

/** Only http(s) URLs are ever put in a link or opened (SPEC §13). */
export function isHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The screen-reader name of an attachment tile: "Attachment, report.pdf, 2.3 MB". */
export function attachmentLabel(a: Pick<Attachment, 'kind' | 'name' | 'size' | 'title' | 'url'>): string {
  if (a.kind === 'LINK') return `Link, ${a.title || a.url || 'untitled'}`;
  const size = formatBytes(a.size);
  return ['Attachment', a.name || 'file', size].filter(Boolean).join(', ');
}
