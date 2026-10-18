import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function mql(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
}

export function prefersReducedMotion() {
  return mql()?.matches ?? false;
}

/** Live `prefers-reduced-motion` (updates if the OS setting changes). */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = mql();
      m?.addEventListener?.('change', cb);
      return () => m?.removeEventListener?.('change', cb);
    },
    prefersReducedMotion,
    () => false,
  );
}
