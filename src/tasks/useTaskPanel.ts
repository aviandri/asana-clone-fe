import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The task detail panel is driven by `?task=<id>` so it works on any page and is linkable. */
export function useTaskPanel() {
  const [params, setParams] = useSearchParams();
  const taskId = params.get('task');
  const open = useCallback(
    (id: string) =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set('task', id);
        return next;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete('task');
        return next;
      }),
    [setParams],
  );
  return { taskId, open, close };
}
