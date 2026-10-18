import type { Task } from '@/api/types';
import { celebrate } from '@/lib/celebrations';
import { showToast } from '@/lib/toast';
import { useUpdateTask } from './useTaskMutations';

/**
 * Toggle completion with delight: completing shows an "Undo" toast, and completing the last open
 * task in a section fires the (rare) celebration.
 */
export function useToggleComplete() {
  const update = useUpdateTask();
  return (task: Pick<Task, 'id' | 'title' | 'completed'>, opts: { lastOpenInSection?: boolean; origin?: { x: number; y: number } } = {}) => {
    const completing = !task.completed;
    update.mutate({ id: task.id, patch: { completed: completing } });
    if (!completing) return;
    showToast(`Completed “${task.title}”`, 'info', {
      action: { label: 'Undo', onClick: () => update.mutate({ id: task.id, patch: { completed: false } }) },
    });
    if (opts.lastOpenInSection) celebrate(opts.origin);
  };
}

/** Viewport point of an element's centre — where a celebration bursts from. */
export function originOf(el: Element | null | undefined) {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
