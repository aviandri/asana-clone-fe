import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import type { Task } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { CommentIcon, PlusIcon, SubtaskIcon } from '@/components/icons';
import { dueTone, formatDue } from '@/lib/dates';
import { positionAtEnd } from '@/lib/position';
import { filterByCompletion } from '@/lib/taskFilters';
import { CompleteToggle, PriorityBadge } from '@/tasks/fields';
import { useCreateTask, useUpdateTask } from '@/tasks/useTaskMutations';
import { useTaskPanel } from '@/tasks/useTaskPanel';
import type { ProjectViewProps } from './ProjectPage';
import { NO_SECTION, useSectionDnd } from './useSectionDnd';
import { useSectionMutations } from './useSectionMutations';

function CardBody({ task, canEdit, onToggle }: { task: Task; canEdit: boolean; onToggle?: () => void }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          <CompleteToggle
            size="sm"
            completed={task.completed}
            label={task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
            onToggle={() => canEdit && onToggle?.()}
          />
        </span>
        <span className={clsx('min-w-0 flex-1 break-words text-sm', task.completed && 'text-gray-500 line-through')}>
          {task.title}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
        <PriorityBadge priority={task.priority} />
        {task.subtaskCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-gray-500" title="Subtasks">
            {task.completedSubtaskCount}/{task.subtaskCount}
            <SubtaskIcon className="h-3 w-3" />
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-gray-500" title="Comments">
            {task.commentCount}
            <CommentIcon className="h-3 w-3" />
          </span>
        )}
        <span className="flex-1" />
        {task.dueDate && <span className={clsx('text-xs', dueTone(task.dueDate, task.completed))}>{formatDue(task.dueDate)}</span>}
        {task.assignee && <Avatar user={task.assignee} size="xs" />}
      </div>
    </>
  );
}

function BoardCard({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const panel = useTaskPanel();
  const update = useUpdateTask();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canEdit,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      // dnd-kit gives the card role="button"; keep it a list item with a descriptive name.
      role="listitem"
      aria-roledescription="draggable task"
      aria-label={task.title}
      data-testid={`board-card-${task.id}`}
      onClick={() => panel.open(task.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === 'Enter' && !e.defaultPrevented) panel.open(task.id);
      }}
      className={clsx(
        'cursor-pointer rounded-lg border bg-white p-3 shadow-sm outline-none hover:border-gray-300 focus-visible:ring-2 focus-visible:ring-primary-500',
        panel.taskId === task.id ? 'border-primary-400' : 'border-gray-200',
        isDragging && 'opacity-40',
      )}
    >
      <CardBody task={task} canEdit={canEdit} onToggle={() => update.mutate({ id: task.id, patch: { completed: !task.completed } })} />
    </li>
  );
}

function BoardQuickAdd({ onSubmit, onClose }: { onSubmit: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  return (
    <div className="rounded-lg border border-primary-400 bg-white p-2 shadow-sm">
      <textarea
        autoFocus
        rows={2}
        aria-label="New task name"
        placeholder="Write a task name"
        className="w-full resize-none text-sm focus:outline-none"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim()) onSubmit(title.trim());
          onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (title.trim()) {
              onSubmit(title.trim());
              setTitle('');
            } else onClose();
          } else if (e.key === 'Escape') {
            setTitle('');
            onClose();
          }
        }}
      />
    </div>
  );
}

function Column({
  id,
  name,
  ids,
  byId,
  canEdit,
  adding,
  setAdding,
  onAdd,
}: {
  id: string;
  name: string;
  ids: string[];
  byId: Map<string, Task>;
  canEdit: boolean;
  adding: boolean;
  setAdding: (v: boolean) => void;
  onAdd: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      aria-label={name}
      className={clsx('flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-gray-100/70', isOver && 'ring-2 ring-primary-300')}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</h2>
        <span className="text-xs text-gray-500">{ids.length}</span>
        {canEdit && (
          <button
            type="button"
            aria-label={`Add a task to ${name}`}
            className="rounded p-1 text-gray-500 hover:bg-gray-200"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </header>
      <div ref={setNodeRef} className="min-h-[3rem] flex-1 overflow-y-auto px-2 pb-2">
        <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2" aria-label={`${name} tasks`}>
            {ids.map((tid) => {
              const t = byId.get(tid);
              return t ? <BoardCard key={tid} task={t} canEdit={canEdit} /> : null;
            })}
          </ul>
        </SortableContext>
        {adding && (
          <div className="mt-2">
            <BoardQuickAdd onSubmit={onAdd} onClose={() => setAdding(false)} />
          </div>
        )}
        {canEdit && !adding && (
          <button
            type="button"
            className="mt-2 flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-200 hover:text-gray-800"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add a task
          </button>
        )}
      </div>
    </section>
  );
}

export function BoardView({ project, tasks, canEdit, filter, addingTo, setAddingTo }: ProjectViewProps) {
  const update = useUpdateTask();
  const create = useCreateTask();
  const sections = useSectionMutations(project.id);
  const [newSection, setNewSection] = useState(false);

  const groups = useMemo(() => {
    const visible = filterByCompletion(tasks, filter, new Set());
    const g: Record<string, Task[]> = {};
    const unsectioned = visible.filter((t) => !t.sectionId);
    if (unsectioned.length) g[NO_SECTION] = unsectioned;
    for (const s of project.sections) g[s.id] = [];
    for (const t of visible) if (t.sectionId && g[t.sectionId]) g[t.sectionId].push(t);
    for (const list of Object.values(g)) list.sort((a, b) => a.position - b.position);
    return g;
  }, [tasks, filter, project.sections]);

  const dnd = useSectionDnd(groups, (m) =>
    update.mutate({ id: m.taskId, patch: { sectionId: m.sectionId, position: m.position } }),
  );

  const columns = [
    ...(groups[NO_SECTION] ? [{ id: NO_SECTION, name: 'Untitled section' }] : []),
    ...project.sections.map((s) => ({ id: s.id, name: s.name })),
  ];

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      <DndContext {...dnd.dndProps}>
        {columns.map((c) => (
          <Column
            key={c.id}
            id={c.id}
            name={c.name}
            ids={dnd.items[c.id] ?? []}
            byId={dnd.byId}
            canEdit={canEdit}
            adding={addingTo === (c.id === NO_SECTION ? '' : c.id)}
            setAdding={(v) => setAddingTo(v ? (c.id === NO_SECTION ? '' : c.id) : null)}
            onAdd={(title) =>
              create.mutate({
                title,
                projectId: project.id,
                sectionId: c.id === NO_SECTION ? null : c.id,
                position: positionAtEnd(groups[c.id] ?? []),
              })
            }
          />
        ))}
        <DragOverlay>
          {dnd.activeTask && (
            <div className="w-72 rotate-2 cursor-grabbing rounded-lg border border-gray-300 bg-white p-3 shadow-lg">
              <CardBody task={dnd.activeTask} canEdit={false} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {canEdit && (
        <div className="w-72 shrink-0">
          {newSection ? (
            <input
              autoFocus
              aria-label="New section name"
              placeholder="Section name"
              className="input"
              onBlur={(e) => {
                const name = e.currentTarget.value.trim();
                if (name) sections.create.mutate({ name, position: positionAtEnd(project.sections) });
                setNewSection(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.currentTarget.value = '';
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            <button type="button" className="btn-ghost w-full justify-start" onClick={() => setNewSection(true)}>
              <PlusIcon /> Add section
            </button>
          )}
        </div>
      )}
    </div>
  );
}
