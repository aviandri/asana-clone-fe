import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './reducedMotion';

/**
 * Animate a number from its previous value to `value` (ease-out, ≤ 400ms). First render shows the
 * final value immediately (no count-up on page load → no flicker); reduced motion jumps directly.
 */
export function useCountUp(value: number, durationMs = 400) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    // Use performance.now() rather than the rAF timestamp: they can differ in time base, and the
    // frame timestamp may precede t0 — either would push progress outside [0, 1].
    const tick = () => {
      const p = Math.min(1, Math.max(0, (performance.now() - t0) / durationMs));
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return shown;
}
