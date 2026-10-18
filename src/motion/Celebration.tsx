import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';
import { onCelebrate } from '@/lib/celebrations';
import { prefersReducedMotion } from './reducedMotion';

// A Mekari-flower petal (the mark's 4-lobed petal, simplified) in brand magenta/purple.
const COLORS = ['#E0257F', '#FF5FA2', '#651FFF', '#8F5CFF', '#B0136B', '#FFD1E6'];
const PETALS = 14;

type Burst = { id: number; x: number; y: number };

/**
 * ~700ms burst of petals from a point (default: upper centre). Purely decorative: aria-hidden,
 * pointer-events none, never blocks input. Skipped entirely under prefers-reduced-motion.
 */
export function Celebration() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  useEffect(
    () =>
      onCelebrate((origin) => {
        if (prefersReducedMotion()) return;
        const b = {
          id: Date.now() + Math.random(),
          x: origin?.x ?? window.innerWidth / 2,
          y: origin?.y ?? window.innerHeight / 3,
        };
        setBursts((list) => [...list.slice(-1), b]); // at most two overlapping bursts
        window.setTimeout(() => setBursts((list) => list.filter((x) => x.id !== b.id)), 900);
      }),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" data-testid="celebration-layer">
      <AnimatePresence>
        {bursts.map((b) => (
          <div key={b.id} data-testid="celebration-burst" className="absolute" style={{ left: b.x, top: b.y }}>
            {Array.from({ length: PETALS }, (_, i) => {
              const angle = (i / PETALS) * Math.PI * 2 + (i % 2) * 0.2;
              const dist = 70 + ((i * 37) % 50);
              return (
                <m.svg
                  key={i}
                  viewBox="0 0 10 14"
                  width={10}
                  height={14}
                  className="absolute -ml-[5px] -mt-[7px]"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
                  animate={{
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist + 30, // a little gravity
                    opacity: 0,
                    scale: 1,
                    rotate: (i % 2 ? 1 : -1) * (120 + i * 12),
                  }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                >
                  <path d="M5 0C7.8 2.6 9.6 6 8.6 9.4 7.9 11.9 6.4 13.4 5 14 3.6 13.4 2.1 11.9 1.4 9.4.4 6 2.2 2.6 5 0Z" fill={COLORS[i % COLORS.length]} />
                </m.svg>
              );
            })}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
