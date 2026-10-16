// Chart palette — the dataviz reference categorical slots 1–3 (blue, orange, aqua), validated with
// the skill's validate_palette.js on our white surface: CVD ΔE 9.2, normal-vision ΔE 27.6 (PASS).
// Aqua is < 3:1 on white, so every chart ships a legend + table view (the "relief" rule).
// Slots are assigned by meaning and never re-ordered by rank, so a series keeps its colour.
export const SERIES = {
  slot1: '#2a78d6',
  slot2: '#eb6834',
  slot3: '#1baf7a',
} as const;

export const CHART = {
  grid: '#e1e0d9',
  axis: '#898781',
  ink: '#52514e',
} as const;
