// Goal time periods (SPEC §10): `YYYY` | `YYYY-H1|H2` | `YYYY-Q1..Q4`.
export const PERIOD_RE = /^\d{4}(-(H[12]|Q[1-4]))?$/;

export function currentQuarter(now = new Date()) {
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
}
export function currentHalf(now = new Date()) {
  return `${now.getFullYear()}-H${now.getMonth() < 6 ? 1 : 2}`;
}

/** "2026-Q4" → "Q4 2026", "2026-H1" → "H1 2026", "2026" → "FY 2026". */
export function periodLabel(p: string) {
  const [y, part] = p.split('-');
  return part ? `${part} ${y}` : `FY ${y}`;
}

const RANK: Record<string, number> = { '': 0, H1: 1, Q1: 2, Q2: 3, H2: 4, Q3: 5, Q4: 6 };
/** Newest year first; within a year: year, H1, Q1, Q2, H2, Q3, Q4. */
export function sortPeriods(periods: string[]) {
  return [...new Set(periods)].sort((a, b) => {
    const [ya, pa = ''] = a.split('-');
    const [yb, pb = ''] = b.split('-');
    return Number(yb) - Number(ya) || RANK[pa] - RANK[pb];
  });
}

/** Periods surrounding `now` — always offered even before goals exist for them. */
export function defaultPeriods(now = new Date()) {
  const y = now.getFullYear();
  return [String(y), currentHalf(now), currentQuarter(now)];
}
