import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { showToast } from '@/lib/toast';
import { CopyIcon } from './icons';

/** Copies `text`, saying "Copied" for a moment. The clipboard API needs a secure context; without it, says so. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    const write = navigator.clipboard?.writeText(text);
    if (!write) return showToast('Couldn’t copy. Select the text and copy it yourself.');
    write.then(
      () => setCopied(true),
      () => showToast('Couldn’t copy. Select the text and copy it yourself.'),
    );
  };
  return (
    <button type="button" aria-label={label} className={clsx('btn-secondary shrink-0', className)} onClick={copy}>
      <CopyIcon className="h-3.5 w-3.5" />
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
