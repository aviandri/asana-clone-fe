import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { dismissToast, subscribeToasts, type Toast } from '@/lib/toast';

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={clsx(
            'pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-white shadow-lg',
            t.tone === 'error' ? 'bg-red-700' : 'bg-gray-900',
          )}
        >
          {t.message}
          <button type="button" aria-label="Dismiss" className="text-white/70 hover:text-white" onClick={() => dismissToast(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
