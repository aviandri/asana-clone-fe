// Motion tokens — Slack-like: fast, friendly, never in the way.
// Enter = ease-out, exit = ease-in, 120–220ms; springs for panels and drag/drop.
// Only transform and opacity are animated (no layout properties → no layout shift).
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN = [0.7, 0, 0.84, 0] as const;

export const DUR = { fast: 0.12, base: 0.18, slow: 0.22 } as const;

export const enter = { duration: DUR.base, ease: EASE_OUT };
export const exit = { duration: DUR.fast, ease: EASE_IN };
export const panelSpring = { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } as const;

/** List-entry stagger: at most 10 items, 20ms apart. */
export const staggerDelay = (index: number) => Math.min(index, 9) * 0.02;
