import { differenceInCalendarDays, format, isSameYear, parseISO } from 'date-fns';

/** Parse a `YYYY-MM-DD` date-only string as a *local* date (not UTC midnight). */
export function parseDateOnly(s: string): Date {
  return parseISO(s);
}

export function toDateOnly(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Asana-style relative label: Today, Tomorrow, Yesterday, weekday within a week, else "Oct 3". */
export function formatDue(s: string, now = new Date()): string {
  const d = parseDateOnly(s);
  const diff = differenceInCalendarDays(d, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return format(d, 'EEEE');
  return isSameYear(d, now) ? format(d, 'MMM d') : format(d, 'MMM d, yyyy');
}

/** Tailwind text color for a due date: overdue red, today/tomorrow green, else gray. */
export function dueTone(s: string | null, completed = false, now = new Date()): string {
  if (!s || completed) return 'text-gray-500';
  const diff = differenceInCalendarDays(parseDateOnly(s), now);
  if (diff < 0) return 'text-red-600';
  if (diff <= 1) return 'text-green-700';
  return 'text-gray-500';
}
