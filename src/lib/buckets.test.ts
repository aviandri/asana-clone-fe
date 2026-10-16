import { describe, expect, it } from 'vitest';
import { bucketFor, groupByBucket } from './buckets';

const now = new Date(2026, 9, 15, 9);
const t = (dueDate: string | null, completed = false, title = 'x') => ({ dueDate, completed, title });

describe('due-date buckets', () => {
  it('assigns buckets relative to today', () => {
    expect(bucketFor(t('2026-10-14'), now)).toBe('overdue');
    expect(bucketFor(t('2026-10-15'), now)).toBe('today');
    expect(bucketFor(t('2026-10-22'), now)).toBe('week');
    expect(bucketFor(t('2026-10-23'), now)).toBe('later');
    expect(bucketFor(t(null), now)).toBe('none');
  });
  it('puts completed tasks in their own group (never overdue)', () => {
    expect(bucketFor(t('2026-10-01', true), now)).toBe('completed');
    expect(bucketFor(t(null, true), now)).toBe('completed');
  });
  it('sorts by due date within a bucket', () => {
    const g = groupByBucket([t('2026-10-20', false, 'b'), t('2026-10-17', false, 'a')], now);
    expect(g.week.map((x) => x.title)).toEqual(['a', 'b']);
  });
});
