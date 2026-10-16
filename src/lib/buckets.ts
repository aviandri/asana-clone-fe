import { differenceInCalendarDays } from 'date-fns';
import type { Task } from '@/api/types';
import { parseDateOnly } from './dates';

export type BucketKey = 'overdue' | 'today' | 'week' | 'later' | 'none';
export const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No due date' },
];

export function bucketFor(task: Pick<Task, 'dueDate' | 'completed'>, now = new Date()): BucketKey {
  if (!task.dueDate) return 'none';
  const diff = differenceInCalendarDays(parseDateOnly(task.dueDate), now);
  if (diff < 0) return task.completed ? 'today' : 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

/** Group tasks into due-date buckets, sorted by due date then title within each. */
export function groupByBucket<T extends Pick<Task, 'dueDate' | 'completed' | 'title'>>(tasks: T[], now = new Date()) {
  const out: Record<BucketKey, T[]> = { overdue: [], today: [], week: [], later: [], none: [] };
  for (const t of tasks) out[bucketFor(t, now)].push(t);
  for (const list of Object.values(out)) {
    list.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.title.localeCompare(b.title));
  }
  return out;
}
