import clsx from 'clsx';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { createPortal } from 'react-dom';
import { enter, exit } from '@/motion/tokens';
import { XIcon } from './icons';

const WIDTH = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '5xl': 'max-w-5xl' } as const;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible modal dialog: portal, backdrop, Escape to close, focus trap, focus restore. */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  hideTitle,
  position = 'center',
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  hideTitle?: boolean;
  position?: 'center' | 'top';
  /** A prop, not a class: Tailwind emits `max-w-md` after `max-w-lg`/`-5xl`, so classes can't override it. */
  width?: keyof typeof WIDTH;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The effect below must run only when the modal opens and closes: callers often pass an inline
  // onClose, and re-running it on every render would move focus back to the dialog (and, on
  // cleanup, to whatever had it before), yanking keyboard focus off the control in use.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // Focus the first field (or the dialog) unless something inside already has autoFocus.
    if (el && !el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>('[autofocus], input, textarea, select') ?? el).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          key="modal"
          className={clsx('fixed inset-0 z-50 flex justify-center bg-black/40 px-4', position === 'top' ? 'items-start pt-[12vh]' : 'items-center')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: enter }}
          exit={{ opacity: 0, transition: exit }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <m.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={clsx('w-full rounded-xl bg-white shadow-2xl outline-none', WIDTH[width], className)}
            initial={{ opacity: 0, scale: 0.97, y: position === 'top' ? -6 : 4 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: enter }}
            exit={{ opacity: 0, scale: 0.98, transition: exit }}
          >
            <div className={clsx('flex items-center gap-2 px-5 pt-4', hideTitle && 'sr-only')}>
              <h2 id={titleId} className="flex-1 text-lg font-semibold">
                {title}
              </h2>
              <button type="button" aria-label="Close" className="btn-ghost p-1.5" onClick={onClose}>
                <XIcon />
              </button>
            </div>
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
