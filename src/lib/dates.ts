import {
  addDays,
  differenceInCalendarDays,
  differenceInSeconds,
  endOfMonth,
  formatDistanceToNowStrict,
  endOfWeek,
  format,
  isSameYear,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

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

/** All days shown in a month grid (whole weeks, Sunday start). */
export function monthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month));
  const end = endOfWeek(endOfMonth(month));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Compact timestamp for feeds: "just now", "5 minutes ago", "Oct 3", "Oct 3, 2025". */
export function timeAgo(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const secs = differenceInSeconds(now, d);
  if (secs < 60) return 'just now';
  if (secs < 24 * 3600) return `${formatDistanceToNowStrict(d)} ago`;
  return isSameYear(d, now) ? format(d, 'MMM d') : format(d, 'MMM d, yyyy');
}
