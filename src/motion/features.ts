// Loaded on demand by <LazyMotion> so the animation engine stays out of the main bundle.
// domMin = domAnimation minus gesture features: press/hover feedback is plain CSS here, so we only
// need animate/exit — keeps the added JS within budget.
import { domMin } from 'motion/react';
export default domMin;
