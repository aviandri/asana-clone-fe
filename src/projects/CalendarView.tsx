import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import clsx from 'clsx';
import { addMonths, format, isSameMonth, isToday, startOfMonth } from 'date-fns';
import { useMemo, useState } from 'react';
import type { Task } from '@/api/types';
import { ChevronRightIcon, PlusIcon } from '@/components/icons';
import { monthGrid, toDateOnly } from '@/lib/dates';
import { filterByCompletion } from '@/lib/taskFilters';
import { useCreateTask, useUpdateTask } from '@/tasks/useTaskMutations';
import { useTaskPanel } from '@/tasks/useTaskPanel';
import type { ProjectViewProps } from './ProjectPage';

function TaskChip({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const panel = useTaskPanel();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !canEdit });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      onClick={() => panel.open(task.id)}
      className={clsx(
        'block w-full truncate rounded px-1.5 py-0.5 text-left text-xs',
        task.completed ? 'bg-gray-100 text-gray-500 line-through' : 'bg-blue-100 text-blue-900 hover:bg-blue-200',
        panel.taskId === task.id && 'ring-1 ring-blue-500',
        isDragging && 'relative z-10 opacity-80 shadow',
      )}
    >
      {task.title}
    </button>
  );
}

function DayCell({
  day,
  month,
  tasks,
  canEdit,
  onAdd,
}: {
  day: Date;
  month: Date;
  tasks: Task[];
  canEdit: boolean;
  onAdd: (title: string, dueDate: string) => void;
}) {
  const key = toDateOnly(day);
  const { setNodeRef, isOver } = useDroppable({ id: key });
  const [adding, setAdding] = useState(false);
  const label = format(day, 'EEEE, MMMM d');
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={label}
      className={clsx(
        'group flex min-h-[6.5rem] flex-col border-b border-r border-gray-200 p-1',
        !isSameMonth(day, month) && 'bg-gray-50 text-gray-400',
        isOver && 'bg-blue-50',
      )}
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span
          className={clsx(
            'flex h-6 min-w-6 items-center justify-center rounded-full text-xs',
            isToday(day) && 'bg-brand-500 px-1.5 font-semibold text-white',
          )}
        >
          {format(day, day.getDate() === 1 ? 'MMM d' : 'd')}
        </span>
        {canEdit && (
          <button
            type="button"
            aria-label={`Add a task on ${label}`}
            className="rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 focus:opacity-100 group-hover:opacity-100"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="space-y-0.5">
        {tasks.slice(0, 4).map((t) => (
          <TaskChip key={t.id} task={t} canEdit={canEdit} />
        ))}
        {tasks.length > 4 && <div className="px-1.5 text-xs text-gray-500">+{tasks.length - 4} more</div>}
        {adding && (
          <input
            autoFocus
            aria-label="New task name"
            className="w-full rounded border border-blue-500 px-1 py-0.5 text-xs focus:outline-none"
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v) onAdd(v, key);
              setAdding(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.currentTarget.value = '';
                e.currentTarget.blur();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

export function CalendarView({ project, tasks, canEdit, filter }: ProjectViewProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const update = useUpdateTask();
  const create = useCreateTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const visible = useMemo(() => filterByCompletion(tasks, filter, new Set()), [tasks, filter]);
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of visible) if (t.dueDate) m.set(t.dueDate, [...(m.get(t.dueDate) ?? []), t]);
    return m;
  }, [visible]);
  const undated = visible.filter((t) => !t.dueDate).length;
  const days = monthGrid(month);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const task = visible.find((t) => t.id === active.id);
    const dueDate = String(over.id);
    if (task && task.dueDate !== dueDate) update.mutate({ id: task.id, patch: { dueDate } });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-6 py-2">
        <button type="button" className="btn-secondary py-1" onClick={() => setMonth(startOfMonth(new Date()))}>
          Today
        </button>
        <button type="button" aria-label="Previous month" className="btn-ghost p-1.5" onClick={() => setMonth((m) => addMonths(m, -1))}>
          <ChevronRightIcon className="rotate-180" />
        </button>
        <button type="button" aria-label="Next month" className="btn-ghost p-1.5" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRightIcon />
        </button>
        <h2 className="text-base font-semibold" aria-live="polite">
          {format(month, 'MMMM yyyy')}
        </h2>
        <span className="flex-1" />
        {undated > 0 && <span className="text-xs text-gray-500">{undated} task(s) without a due date</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
        <div role="grid" aria-label={`${project.name} calendar, ${format(month, 'MMMM yyyy')}`} className="min-w-[42rem] border-l border-t border-gray-200">
          <div role="row" className="grid grid-cols-7">
            {days.slice(0, 7).map((d) => (
              <div key={d.toISOString()} role="columnheader" className="border-b border-r border-gray-200 px-2 py-1 text-xs font-medium text-gray-500">
                {format(d, 'EEE')}
              </div>
            ))}
          </div>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            {Array.from({ length: days.length / 7 }, (_, w) => (
              <div key={w} role="row" className="grid grid-cols-7">
                {days.slice(w * 7, w * 7 + 7).map((d) => (
                  <DayCell
                    key={d.toISOString()}
                    day={d}
                    month={month}
                    tasks={byDay.get(toDateOnly(d)) ?? []}
                    canEdit={canEdit}
                    onAdd={(title, dueDate) =>
                      create.mutate({ title, projectId: project.id, sectionId: project.sections[0]?.id ?? null, dueDate })
                    }
                  />
                ))}
              </div>
            ))}
          </DndContext>
        </div>
      </div>
    </div>
  );
}
