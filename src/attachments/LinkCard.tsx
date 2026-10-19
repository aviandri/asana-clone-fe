import clsx from 'clsx';
import { useState } from 'react';
import { attachmentUrls } from '@/api/endpoints';
import type { Attachment } from '@/api/types';
import { LinkIcon } from '@/components/icons';
import { attachmentLabel, hostOf, isHttpUrl } from './fileTypes';
import { providerBadge } from './providers';

/** The provider badge, else the server-cached site icon, else a generic link glyph. */
function LinkGlyph({ a }: { a: Attachment }) {
  const [broken, setBroken] = useState(false);
  const badge = providerBadge(a.provider);
  const icon = broken ? null : attachmentUrls.linkIcon(a);
  if (badge) {
    return (
      <span aria-hidden className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white', badge.tone)}>
        {badge.initials}
      </span>
    );
  }
  if (icon) return <img src={icon} alt="" className="h-6 w-6 shrink-0 rounded" onError={() => setBroken(true)} />;
  return (
    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-500">
      <LinkIcon className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * A link's preview card: image, icon, title, site and two lines of description. A preview that
 * failed (or isn't there yet) falls back to the domain and provider (SPEC §13). Only http(s) URLs
 * become a link; anything else is shown as text.
 */
export function LinkCard({ a, compact = false }: { a: Attachment; compact?: boolean }) {
  const [imageBroken, setImageBroken] = useState(false);
  const host = hostOf(a.url);
  const badge = providerBadge(a.provider);
  const image = compact || imageBroken ? null : attachmentUrls.linkImage(a);
  const title = a.title || host || 'Link';
  const site = a.siteName || badge?.name || host;
  const body = (
    <>
      {image && <img src={image} alt="" loading="lazy" className="h-24 w-full bg-gray-50 object-cover" onError={() => setImageBroken(true)} />}
      <span className="flex gap-2 p-2">
        <LinkGlyph a={a} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-gray-800">{title}</span>
          <span className="block truncate text-[11px] text-gray-500">{site}</span>
          {a.previewStatus === 'PENDING' && <span className="block text-[11px] text-gray-500">Fetching preview…</span>}
          {!compact && a.description && <span className="mt-0.5 line-clamp-2 block text-[11px] text-gray-600">{a.description}</span>}
        </span>
      </span>
    </>
  );
  const className = 'block w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-left hover:border-gray-300';
  return isHttpUrl(a.url) ? (
    <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={attachmentLabel(a)} className={className}>
      {body}
    </a>
  ) : (
    <div aria-label={attachmentLabel(a)} className={className}>
      {body}
    </div>
  );
}
