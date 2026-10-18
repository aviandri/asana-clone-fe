import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetWorkspaceId } from '@/workspace/workspaceId';

afterEach(() => cleanup());

// jsdom lacks ResizeObserver (used by Recharts' ResponsiveContainer).
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// Motion: run animations instantly in tests (exits resolve immediately, deterministic DOM).
import { MotionGlobalConfig } from 'motion/react';
MotionGlobalConfig.skipAnimations = true;

// Controllable prefers-reduced-motion (jsdom has no matchMedia). Tests flip it via setReducedMotion().
let reducedMotion = false;
const mqlListeners = new Set<() => void>();
export function setReducedMotion(on: boolean) {
  reducedMotion = on;
  mqlListeners.forEach((l) => l());
}
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    get matches() {
      return query.includes('prefers-reduced-motion') ? reducedMotion : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, l: () => void) => mqlListeners.add(l),
    removeEventListener: (_: string, l: () => void) => mqlListeners.delete(l),
    addListener: (l: () => void) => mqlListeners.add(l),
    removeListener: (l: () => void) => mqlListeners.delete(l),
    dispatchEvent: () => false,
  }),
});
afterEach(() => {
  setReducedMotion(false);
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  resetWorkspaceId();
});
