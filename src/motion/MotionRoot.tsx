import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { Celebration } from './Celebration';
import { enter } from './tokens';

// The animation features load asynchronously in their own chunk; until then `m.*` elements render
// in their final state (no flash, no layout shift).
const loadFeatures = () => import('./features').then((mod) => mod.default);

/**
 * LazyMotion keeps the motion bundle small (domMin features, `m.*` components only).
 * reducedMotion="user": with `prefers-reduced-motion`, transform animations are skipped and only
 * opacity fades remain.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={enter}>
        {children}
        <Celebration />
      </MotionConfig>
    </LazyMotion>
  );
}
