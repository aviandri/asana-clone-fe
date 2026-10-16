import type { Goal, GoalStatus, KeyResult, ProgressSource } from '@/api/types';

export const GOAL_STATUS: Record<GoalStatus, { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'done' }> = {
  NO_STATUS: { label: 'No status', tone: 'neutral' },
  ON_TRACK: { label: 'On track', tone: 'good' },
  AT_RISK: { label: 'At risk', tone: 'warn' },
  OFF_TRACK: { label: 'Off track', tone: 'bad' },
  ACHIEVED: { label: 'Achieved', tone: 'done' },
  PARTIAL: { label: 'Partial', tone: 'warn' },
  MISSED: { label: 'Missed', tone: 'bad' },
  DROPPED: { label: 'Dropped', tone: 'neutral' },
};
export const GOAL_STATUSES = Object.keys(GOAL_STATUS) as GoalStatus[];

export const PROGRESS_SOURCE_LABEL: Record<ProgressSource, string> = {
  KEY_RESULTS: 'Key results',
  SUB_GOALS: 'Sub-goals',
  PROJECTS: 'Linked projects',
  MANUAL: 'Manual',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Same formula as the server (SPEC §10) — used for optimistic updates only. */
export function krProgressOf(k: Pick<KeyResult, 'startValue' | 'targetValue' | 'currentValue'>) {
  const { startValue: s, targetValue: t, currentValue: c } = k;
  if (t === s) return c >= t ? 100 : 0;
  return round1(Math.min(100, Math.max(0, ((c - s) / (t - s)) * 100)));
}

/** "18,000 USD" → "$18,000"; "72 %" → "72%"; "2,000 ms". */
export function formatMetric(value: number, kr: Pick<KeyResult, 'metricType' | 'unit'>) {
  if (kr.metricType === 'BOOLEAN') return value >= 1 ? 'Done' : 'Not done';
  if (kr.metricType === 'CURRENCY' && kr.unit && /^[A-Z]{3}$/.test(kr.unit)) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: kr.unit, maximumFractionDigits: 2 }).format(value);
    } catch {
      // unknown currency code — fall through
    }
  }
  const n = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (kr.metricType === 'PERCENT') return `${n}%`;
  return kr.unit ? `${n} ${kr.unit}` : n;
}

export type GoalNode = { goal: Goal; children: GoalNode[] };

/**
 * Build the cascade tree from a flat list. Goals whose parent isn't in the list (other period,
 * filtered out, deleted) become roots. Siblings keep the API order.
 */
export function buildGoalTree(goals: Goal[]): GoalNode[] {
  const byId = new Map(goals.map((g) => [g.id, { goal: g, children: [] as GoalNode[] }]));
  const roots: GoalNode[] = [];
  for (const node of byId.values()) {
    const parent = node.goal.parentId ? byId.get(node.goal.parentId) : undefined;
    // Guard against bad data cycles: only attach if it doesn't make the node its own ancestor.
    if (parent && !isAncestor(byId, node.goal.id, parent.goal.id)) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
function isAncestor(byId: Map<string, GoalNode>, ancestorId: string, id: string): boolean {
  const seen = new Set<string>();
  for (let cur = byId.get(id); cur && !seen.has(cur.goal.id); cur = cur.goal.parentId ? byId.get(cur.goal.parentId) : undefined) {
    if (cur.goal.id === ancestorId) return true;
    seen.add(cur.goal.id);
  }
  return false;
}

export const MAX_GOAL_DEPTH = 6;

/** Depth of a goal counting itself (root = 1), from the known parent chain. */
export function depthOf(goals: Pick<Goal, 'id' | 'parentId'>[], id: string): number {
  const byId = new Map(goals.map((g) => [g.id, g]));
  let d = 0;
  const seen = new Set<string>();
  for (let cur = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    seen.add(cur.id);
    d += 1;
  }
  return d;
}

export function goalLevelLabel(g: Pick<Goal, 'isCompany' | 'team'>) {
  return g.isCompany ? 'Company' : g.team ? g.team.name : 'Personal';
}
