// "Celebrations" preference (profile toggle, on by default) + a tiny event bus that triggers the
// petal burst. Celebrations are rare by design: callers fire them only for real milestones.
import { useSyncExternalStore } from 'react';

const KEY = 'mekari-project:celebrations';
type Listener = () => void;
const prefListeners = new Set<Listener>();
const burstListeners = new Set<(origin?: { x: number; y: number }) => void>();

export function celebrationsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setCelebrationsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked — preference just won't persist
  }
  prefListeners.forEach((l) => l());
}

export function useCelebrationsEnabled() {
  return useSyncExternalStore(
    (cb) => {
      prefListeners.add(cb);
      return () => prefListeners.delete(cb);
    },
    celebrationsEnabled,
    () => true,
  );
}

/** Fire a celebration (no-op when disabled; the renderer also respects reduced motion). */
export function celebrate(origin?: { x: number; y: number }) {
  if (!celebrationsEnabled()) return;
  burstListeners.forEach((l) => l(origin));
}

export function onCelebrate(l: (origin?: { x: number; y: number }) => void) {
  burstListeners.add(l);
  return () => {
    burstListeners.delete(l);
  };
}
