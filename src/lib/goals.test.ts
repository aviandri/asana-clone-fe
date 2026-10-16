import { describe, expect, it } from 'vitest';
import type { Goal } from '@/api/types';
import { buildGoalTree, depthOf, formatMetric, krProgressOf } from './goals';

const g = (id: string, parentId: string | null = null) => ({ id, parentId, title: id }) as Goal;

describe('goal helpers', () => {
  it('builds a tree, treating goals with missing parents as roots', () => {
    const tree = buildGoalTree([g('a'), g('b', 'a'), g('c', 'b'), g('d', 'zzz')]);
    expect(tree.map((n) => n.goal.id)).toEqual(['a', 'd']);
    expect(tree[0].children[0].children[0].goal.id).toBe('c');
  });
  it('does not loop on cyclic data', () => {
    const tree = buildGoalTree([g('a', 'b'), g('b', 'a')]);
    expect(tree.length).toBeGreaterThan(0);
  });
  it('computes depth from the parent chain', () => {
    expect(depthOf([g('a'), g('b', 'a'), g('c', 'b')], 'c')).toBe(3);
  });
  it('formats metrics', () => {
    expect(formatMetric(72, { metricType: 'PERCENT', unit: '%' })).toBe('72%');
    expect(formatMetric(1, { metricType: 'BOOLEAN', unit: null })).toBe('Done');
    expect(formatMetric(2000, { metricType: 'NUMBER', unit: 'ms' })).toMatch(/^2.?000 ms$/);
    expect(formatMetric(18000, { metricType: 'CURRENCY', unit: 'USD' })).toMatch(/18.?000/);
  });
  it('mirrors server KR progress', () => {
    expect(krProgressOf({ startValue: 2400, targetValue: 1200, currentValue: 2000 })).toBe(33.3);
  });
});
