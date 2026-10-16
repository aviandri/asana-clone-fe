const STEP = 1000;

/**
 * Float position between two neighbours (SPEC §2): midpoint, or ±STEP at the ends.
 * `prev`/`next` are the positions of the items that will surround the moved item.
 */
export function positionBetween(prev: number | null | undefined, next: number | null | undefined): number {
  const hasPrev = prev !== null && prev !== undefined;
  const hasNext = next !== null && next !== undefined;
  if (hasPrev && hasNext) return (prev + next) / 2;
  if (hasPrev) return prev + STEP;
  if (hasNext) return next - STEP;
  return STEP;
}

/** Position for appending after the last of `items`. */
export function positionAtEnd(items: { position: number }[]): number {
  if (items.length === 0) return STEP;
  return Math.max(...items.map((i) => i.position)) + STEP;
}

/**
 * Position for an item moved to index `toIndex` within `list` (which must NOT contain the moved
 * item and be sorted by position).
 */
export function positionForIndex(list: { position: number }[], toIndex: number): number {
  return positionBetween(list[toIndex - 1]?.position, list[toIndex]?.position);
}
