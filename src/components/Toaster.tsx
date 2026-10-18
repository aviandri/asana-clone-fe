import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';
import { dismissToast, subscribeToasts, type Toast } from '@/lib/toast';
import { enter, exit } from '@/motion/tokens';

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <m.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: enter }}
            exit={{ opacity: 0, y: 8, transition: exit }}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={clsx(
              'pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-white shadow-lg',
              t.tone === 'error' ? 'bg-red-700' : 'bg-gray-950',
            )}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="rounded px-1.5 py-0.5 font-semibold text-primary-200 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary-300"
                onClick={() => {
                  t.action!.onClick();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="text-white/70 hover:text-white" onClick={() => dismissToast(t.id)}>
              ×
            </button>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
