import { describe, expect, it } from 'vitest';
import { currentHalf, currentQuarter, PERIOD_RE, periodLabel, sortPeriods } from './periods';

describe('goal periods', () => {
  it('computes the current quarter and half', () => {
    expect(currentQuarter(new Date(2026, 9, 15))).toBe('2026-Q4');
    expect(currentQuarter(new Date(2026, 0, 1))).toBe('2026-Q1');
    expect(currentHalf(new Date(2026, 5, 30))).toBe('2026-H1');
    expect(currentHalf(new Date(2026, 6, 1))).toBe('2026-H2');
  });
  it('validates and labels periods', () => {
    expect(['2026', '2026-H2', '2026-Q4'].every((p) => PERIOD_RE.test(p))).toBe(true);
    expect(['2026-Q5', '26-Q1', '2026-H3'].some((p) => PERIOD_RE.test(p))).toBe(false);
    expect(periodLabel('2026-Q4')).toBe('Q4 2026');
    expect(periodLabel('2026')).toBe('FY 2026');
  });
  it('sorts newest year first, then year/half/quarter order', () => {
    expect(sortPeriods(['2025-Q4', '2026-Q1', '2026', '2026-H1', '2026-Q1'])).toEqual(['2026', '2026-H1', '2026-Q1', '2025-Q4']);
  });
});
