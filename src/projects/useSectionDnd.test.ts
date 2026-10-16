import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '@/api/types';
import { NO_SECTION, useSectionDnd } from './useSectionDnd';

const task = (id: string, sectionId: string | null, position: number) => ({ id, sectionId, position }) as Task;

const groups = {
  [NO_SECTION]: [] as Task[],
  a: [task('a1', 'a', 1000), task('a2', 'a', 2000), task('a3', 'a', 3000)],
  b: [task('b1', 'b', 1000), task('b2', 'b', 2000)],
  c: [] as Task[],
};

// Minimal event shapes — the hook only reads ids.
const ev = (active: string, over: string | null) =>
  ({ active: { id: active }, over: over ? { id: over } : null }) as never;

function drag(onMove: ReturnType<typeof vi.fn>, active: string, overs: string[]) {
  const { result } = renderHook(() => useSectionDnd(groups, onMove));
  act(() => result.current.dndProps.onDragStart(ev(active, null)));
  for (const o of overs) act(() => result.current.dndProps.onDragOver(ev(active, o)));
  act(() => result.current.dndProps.onDragEnd(ev(active, overs[overs.length - 1] ?? null)));
  return result;
}

describe('useSectionDnd', () => {
  it('reorders within a section using the midpoint of the new neighbours', () => {
    const onMove = vi.fn();
    drag(onMove, 'a3', ['a1']);
    expect(onMove).toHaveBeenCalledWith({ taskId: 'a3', sectionId: 'a', position: 0 });
  });

  it('moves down within a section between neighbours', () => {
    const onMove = vi.fn();
    drag(onMove, 'a1', ['a2']);
    expect(onMove).toHaveBeenCalledWith({ taskId: 'a1', sectionId: 'a', position: 2500 });
  });

  it('moves into another section before the hovered card', () => {
    const onMove = vi.fn();
    // dragOver inserts before b2; by the drop the item itself is under the pointer.
    drag(onMove, 'a2', ['b2', 'a2']);
    expect(onMove).toHaveBeenCalledWith({ taskId: 'a2', sectionId: 'b', position: 1500 });
  });

  it('drops into an empty section (container id) with the default position', () => {
    const onMove = vi.fn();
    drag(onMove, 'b1', ['c']);
    expect(onMove).toHaveBeenCalledWith({ taskId: 'b1', sectionId: 'c', position: 1000 });
  });

  it('maps the no-section container to sectionId null', () => {
    const onMove = vi.fn();
    drag(onMove, 'a1', [NO_SECTION]);
    expect(onMove).toHaveBeenCalledWith({ taskId: 'a1', sectionId: null, position: 1000 });
  });

  it('does nothing when dropped in place or outside', () => {
    const onMove = vi.fn();
    drag(onMove, 'a2', ['a2']);
    drag(onMove, 'a2', []);
    expect(onMove).not.toHaveBeenCalled();
  });
});
