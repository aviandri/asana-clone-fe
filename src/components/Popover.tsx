import clsx from 'clsx';
import { useEffect, useRef, type ReactNode } from 'react';

/** Minimal anchored popover: closes on outside click and Escape. Render it inside a `relative` parent. */
export function Popover({
  open,
  onClose,
  children,
  className,
  align = 'left',
  placement = 'bottom',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right';
  placement?: 'bottom' | 'top';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={clsx(
        'absolute z-30 rounded-lg border border-gray-200 bg-white py-1 shadow-lg',
        placement === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
        align === 'right' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
