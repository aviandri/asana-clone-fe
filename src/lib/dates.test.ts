import { describe, expect, it } from 'vitest';
import { dueTone, formatDue, parseDateOnly } from './dates';

const now = new Date(2026, 9, 15, 10, 0, 0); // Thu Oct 15 2026, local

describe('dates', () => {
  it('parses date-only strings as local dates', () => {
    const d = parseDateOnly('2026-10-15');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 15]);
  });

  it('formats relative due labels', () => {
    expect(formatDue('2026-10-15', now)).toBe('Today');
    expect(formatDue('2026-10-16', now)).toBe('Tomorrow');
    expect(formatDue('2026-10-14', now)).toBe('Yesterday');
    expect(formatDue('2026-10-19', now)).toBe('Monday');
    expect(formatDue('2026-11-30', now)).toBe('Nov 30');
    expect(formatDue('2027-01-02', now)).toBe('Jan 2, 2027');
  });

  it('colours overdue dates red unless completed', () => {
    expect(dueTone('2026-10-10', false, now)).toBe('text-red-600');
    expect(dueTone('2026-10-10', true, now)).toBe('text-gray-500');
    expect(dueTone('2026-10-16', false, now)).toBe('text-green-700');
  });
});
