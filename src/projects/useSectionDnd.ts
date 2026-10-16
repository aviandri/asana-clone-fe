import {
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '@/api/types';
import { positionBetween } from '@/lib/position';

/** Container id used for tasks without a section. */
export const NO_SECTION = '__none';

export type TaskMove = { taskId: string; sectionId: string | null; position: number };

/**
 * Multi-container sortable state for tasks grouped by section (Board columns / List sections).
 * During a drag it keeps a local ordering override; on drop it computes the new float position
 * from the neighbours (SPEC §2) and reports it via `onMove`.
 */
export function useSectionDnd(groups: Record<string, Task[]>, onMove: (move: TaskMove) => void) {
  const derived = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [k, list] of Object.entries(groups)) out[k] = list.map((t) => t.id);
    return out;
  }, [groups]);
  const byId = useMemo(() => {
    const m = new Map<string, Task>();
    for (const list of Object.values(groups)) for (const t of list) m.set(t.id, t);
    return m;
  }, [groups]);

  const [override, setOverride] = useState<Record<string, string[]> | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const dragging = useRef(false);
  const setActiveId = (id: string | null) => {
    dragging.current = id !== null;
    setActiveIdState(id);
  };
  const items = override ?? derived;

  // New server/optimistic data after a drop replaces the local override (not mid-drag).
  useEffect(() => {
    if (!dragging.current) setOverride(null);
  }, [derived]);

  const sensors = useSensors(
    // Small activation distance so clicks still open the task (e2e contract: ≤10px).
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Space picks up/drops; Enter is left free to open the task.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const findContainer = (id: UniqueIdentifier, state = items): string | undefined => {
    const key = String(id);
    if (key in state) return key;
    return Object.keys(state).find((k) => state[k].includes(key));
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOverride(derived);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setOverride((prev) => {
      const state = prev ?? derived;
      const from = findContainer(active.id, state);
      const to = findContainer(over.id, state);
      if (!from || !to || from === to) return prev;
      const fromList = state[from].filter((id) => id !== active.id);
      const toList = [...state[to]];
      const overIndex = toList.indexOf(String(over.id));
      const insertAt = overIndex >= 0 ? overIndex : toList.length;
      toList.splice(insertAt, 0, String(active.id));
      return { ...state, [from]: fromList, [to]: toList };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    setActiveId(null);
    if (!over) {
      setOverride(null);
      return;
    }
    const state = override ?? derived;
    const container = findContainer(id, state);
    if (!container) {
      setOverride(null);
      return;
    }
    let list = state[container];
    const overIndex = list.indexOf(String(over.id));
    const activeIndex = list.indexOf(id);
    if (overIndex >= 0 && overIndex !== activeIndex) list = arrayMove(list, activeIndex, overIndex);
    setOverride({ ...state, [container]: list });

    const task = byId.get(id);
    if (!task) return;
    const idx = list.indexOf(id);
    const prev = byId.get(list[idx - 1] ?? '');
    const next = byId.get(list[idx + 1] ?? '');
    const sectionId = container === NO_SECTION ? null : container;
    const unchanged = (task.sectionId ?? NO_SECTION) === container && derived[container]?.indexOf(id) === idx;
    if (unchanged) {
      setOverride(null);
      return;
    }
    onMove({ taskId: id, sectionId, position: positionBetween(prev?.position, next?.position) });
  };

  const onDragCancel = () => {
    setActiveId(null);
    setOverride(null);
  };

  return {
    items,
    activeTask: activeId ? (byId.get(activeId) ?? null) : null,
    byId,
    dndProps: { sensors, collisionDetection: closestCorners, onDragStart, onDragOver, onDragEnd, onDragCancel },
  };
}
