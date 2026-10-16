import type { Task } from '@/api/types';

export type CompletionFilter = 'incomplete' | 'completed' | 'all';

/** Filter by completion, always keeping `keepIds` (tasks toggled during this visit stay visible). */
export function filterByCompletion(tasks: Task[], filter: CompletionFilter, keepIds: Set<string>) {
  if (filter === 'all') return tasks;
  return tasks.filter((t) => keepIds.has(t.id) || (filter === 'completed' ? t.completed : !t.completed));
}
