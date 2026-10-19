import clsx from 'clsx';
import { FileIcon } from '@/components/icons';
import { extensionOf, fileFamily, type FileFamily } from './fileTypes';

const TONE: Record<FileFamily, string> = {
  image: 'text-pink-600 bg-pink-50',
  pdf: 'text-red-600 bg-red-50',
  video: 'text-purple-600 bg-purple-50',
  audio: 'text-teal-600 bg-teal-50',
  text: 'text-gray-600 bg-gray-100',
  document: 'text-info bg-info-soft',
  spreadsheet: 'text-green-700 bg-green-50',
  presentation: 'text-orange-600 bg-orange-50',
  archive: 'text-amber-700 bg-amber-50',
  code: 'text-slate-600 bg-slate-100',
  file: 'text-gray-500 bg-gray-100',
};

/** A file glyph with the extension, tinted by type (decorative: the tile's label names the file). */
export function FileTypeIcon({
  mimeType,
  name,
  size = 'md',
}: {
  mimeType: string | null | undefined;
  name: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  const family = fileFamily(mimeType, name);
  const ext = extensionOf(name).slice(0, 4).toUpperCase();
  return (
    <span
      aria-hidden
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center rounded-md',
        TONE[family],
        size === 'sm' && 'h-7 w-7',
        size === 'md' && 'h-11 w-11',
        size === 'lg' && 'h-20 w-20',
      )}
    >
      <FileIcon className={clsx(size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-6 w-6' : 'h-10 w-10')} />
      {ext && size !== 'sm' && (
        <span
          className={clsx(
            'absolute bottom-0.5 rounded bg-white/90 px-0.5 font-semibold leading-none',
            size === 'md' ? 'text-[8px]' : 'text-[11px]',
          )}
        >
          {ext}
        </span>
      )}
    </span>
  );
}
