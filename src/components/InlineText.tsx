import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

/**
 * Text that edits in place: an input styled like plain text. Commits on Enter/blur,
 * reverts on Escape. Empty values are rejected (reverted) unless `allowEmpty`.
 */
export function InlineText({
  value,
  onCommit,
  label,
  className,
  disabled,
  allowEmpty,
  placeholder,
  autoFocus,
  onDone,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Called whenever editing ends (commit, cancel or no change). */
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  // Follow external updates while not editing.
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);

  function commit() {
    const v = draft.trim();
    if (cancelled.current || (!v && !allowEmpty)) {
      cancelled.current = false;
      setDraft(value);
    } else if (v !== value) {
      onCommit(v);
    }
    onDone?.();
  }

  return (
    <input
      ref={ref}
      aria-label={label}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          ref.current?.blur();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          cancelled.current = true;
          ref.current?.blur();
        }
      }}
      className={clsx(
        'min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none disabled:hover:border-transparent',
        className,
      )}
    />
  );
}
