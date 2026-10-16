import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import type { ProjectDetail, Section, Task } from '@/api/types';
import { InlineText } from '@/components/InlineText';
import { Popover } from '@/components/Popover';
import { ChevronDownIcon, ChevronRightIcon, CommentIcon, DotsIcon, GripIcon, PlusIcon, SubtaskIcon } from '@/components/icons';
import { filterByCompletion, type CompletionFilter } from '@/lib/taskFilters';
import { positionAtEnd } from '@/lib/position';
import { AssigneeField, CompleteToggle, DueDateField, PrioritySelect } from '@/tasks/fields';
import { useCreateTask, useUpdateTask } from '@/tasks/useTaskMutations';
import { useTaskPanel } from '@/tasks/useTaskPanel';
import { NO_SECTION, useSectionDnd } from './useSectionDnd';
import { useSectionMutations } from './useSectionMutations';

const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_10rem_8rem_7rem] items-center';

export function TaskRow({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const update = useUpdateTask();
  const panel = useTaskPanel();
  const [renaming, setRenaming] = useState(false);
  const selected = panel.taskId === task.id;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      role="row"
      aria-selected={selected}
      data-testid={`task-row-${task.id}`}
      onClick={() => panel.open(task.id)}
      className={clsx(
        GRID,
        'group cursor-pointer border-b border-gray-100 text-sm hover:bg-gray-50',
        selected && 'bg-blue-50 hover:bg-blue-50',
        isDragging && 'opacity-40',
      )}
    >
      <div role="cell" className="relative flex min-w-0 items-center gap-2 py-1.5 pl-6 pr-2">
        {canEdit && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Move ${task.title}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-1 cursor-grab rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 focus:opacity-100 group-hover:opacity-100"
          >
            <GripIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <CompleteToggle
          completed={task.completed}
          label={task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
          onToggle={() => canEdit && update.mutate({ id: task.id, patch: { completed: !task.completed } })}
        />
        {renaming ? (
          <InlineText
            autoFocus
            label="Task name"
            value={task.title}
            onCommit={(title) => {
              update.mutate({ id: task.id, patch: { title } });
              setRenaming(false);
            }}
            onDone={() => setRenaming(false)}
            className="flex-1"
          />
        ) : (
          <button
            type="button"
            className={clsx(
              'min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left',
              task.completed && 'text-gray-500 line-through',
            )}
            title={canEdit ? 'Click to open · double-click to rename' : undefined}
            onClick={(e) => {
              e.stopPropagation();
              panel.open(task.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (canEdit) setRenaming(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'F2' && canEdit) setRenaming(true);
            }}
          >
            {task.title}
          </button>
        )}
        {task.subtaskCount > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-xs text-gray-500" title="Subtasks">
            {task.completedSubtaskCount}/{task.subtaskCount}
            <SubtaskIcon className="h-3 w-3" />
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-xs text-gray-500" title="Comments">
            {task.commentCount}
            <CommentIcon className="h-3 w-3" />
          </span>
        )}
      </div>
      <div role="cell" className="flex items-center gap-1 px-2 md:block">
        <AssigneeField
          assignee={task.assignee}
          disabled={!canEdit}
          onChange={(u) => update.mutateAsync({ id: task.id, patch: { assigneeId: u?.id ?? null }, assignee: u, quiet: true })}
        />
        <span className="md:hidden">
          <DueDateField
            value={task.dueDate}
            completed={task.completed}
            disabled={!canEdit}
            onChange={(dueDate) => update.mutate({ id: task.id, patch: { dueDate } })}
          />
        </span>
      </div>
      <div role="cell" className="hidden px-2 md:block">
        <DueDateField
          value={task.dueDate}
          completed={task.completed}
          disabled={!canEdit}
          onChange={(dueDate) => update.mutate({ id: task.id, patch: { dueDate } })}
        />
      </div>
      <div role="cell" className="hidden px-2 md:block">
        <PrioritySelect
          value={task.priority}
          disabled={!canEdit}
          label={`Priority for ${task.title}`}
          onChange={(priority) => update.mutate({ id: task.id, patch: { priority } })}
        />
      </div>
    </div>
  );
}

export function QuickAddRow({
  onSubmit,
  onClose,
  placeholder = 'Write a task name',
}: {
  onSubmit: (title: string) => void;
  onClose: () => void;
  placeholder?: string;
}) {
  const [title, setTitle] = useState('');
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 py-1.5 pl-6 pr-2">
      <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-dashed border-gray-300" />
      <input
        autoFocus
        aria-label="New task name"
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded border border-blue-500 px-1 py-0.5 text-sm focus:outline-none"
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
              setTitle(''); // stay open for the next task, like Asana
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

function SectionMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        aria-label="Section actions"
        className="rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-700 focus:opacity-100 group-hover/section:opacity-100"
        onClick={() => setOpen((o) => !o)}
      >
        <DotsIcon />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-44">
        <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100" onClick={() => { setOpen(false); onRename(); }}>
          Rename section
        </button>
        <button type="button" className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-gray-100" onClick={() => { setOpen(false); onDelete(); }}>
          Delete section
        </button>
      </Popover>
    </span>
  );
}

function SectionBlock({
  project,
  section,
  ids,
  byId,
  canEdit,
  adding,
  setAdding,
}: {
  project: ProjectDetail;
  section: Section | null;
  ids: string[];
  byId: Map<string, Task>;
  canEdit: boolean;
  adding: boolean;
  setAdding: (v: boolean) => void;
}) {
  const tasks = ids.map((id) => byId.get(id)).filter((t): t is Task => !!t);
  const { setNodeRef } = useDroppable({ id: section?.id ?? NO_SECTION });
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const create = useCreateTask();
  const sections = useSectionMutations(project.id);
  const name = section?.name ?? 'Untitled section';
  const headingId = `section-${section?.id ?? 'none'}`;

  return (
    <section ref={setNodeRef} aria-labelledby={headingId} className="mb-2">
      <div className="group/section flex items-center gap-1 py-2 pl-1 pr-2">
        <button
          type="button"
          aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
          aria-expanded={!collapsed}
          className="rounded p-1 text-gray-500 hover:bg-gray-100"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        </button>
        {section && renaming ? (
          <InlineText
            autoFocus
            label="Section name"
            value={section.name}
            className="font-semibold"
            onCommit={(v) => {
              sections.update.mutate({ id: section.id, name: v });
              setRenaming(false);
            }}
          />
        ) : (
          <h2
            id={headingId}
            className="truncate px-1 text-base font-semibold"
            onDoubleClick={() => section && canEdit && setRenaming(true)}
          >
            {name}
          </h2>
        )}
        {renaming && <span className="sr-only" id={headingId}>{name}</span>}
        <span className="text-xs text-gray-400">{tasks.length}</span>
        {canEdit && (
          <button
            type="button"
            aria-label={`Add a task to ${name}`}
            className="rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-700 focus:opacity-100 group-hover/section:opacity-100"
            onClick={() => {
              setCollapsed(false);
              setAdding(true);
            }}
          >
            <PlusIcon />
          </button>
        )}
        {canEdit && section && (
          <SectionMenu
            onRename={() => setRenaming(true)}
            onDelete={() => {
              const msg = tasks.length
                ? `Delete section "${section.name}"? Its ${tasks.length} task(s) will move to "Untitled section".`
                : `Delete section "${section.name}"?`;
              if (window.confirm(msg)) sections.remove.mutate(section.id);
            }}
          />
        )}
      </div>
      {!collapsed && (
        <div role="rowgroup">
          <SortableContext id={section?.id ?? NO_SECTION} items={ids} strategy={verticalListSortingStrategy}>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} canEdit={canEdit} />
            ))}
          </SortableContext>
          {adding && (
            <QuickAddRow
              onClose={() => setAdding(false)}
              onSubmit={(title) =>
                create.mutate({
                  title,
                  projectId: project.id,
                  sectionId: section?.id ?? null,
                  position: positionAtEnd(tasks),
                })
              }
            />
          )}
          {canEdit && !adding && (
            <button
              type="button"
              className="ml-6 py-1.5 pl-6 text-left text-sm text-gray-500 hover:text-gray-800"
              onClick={() => setAdding(true)}
            >
              Add a task…
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function ListView({
  project,
  tasks,
  canEdit,
  filter,
  addingTo,
  setAddingTo,
}: {
  project: ProjectDetail;
  tasks: Task[];
  canEdit: boolean;
  filter: CompletionFilter;
  /** section id (or '' for no section) with an open quick-add row */
  addingTo: string | null;
  setAddingTo: (id: string | null) => void;
}) {
  const sections = useSectionMutations(project.id);
  const [newSection, setNewSection] = useState(false);
  // Tasks completed during this visit stay visible (like Asana) until the filter changes.
  const [keep, setKeep] = useState<{ filter: CompletionFilter; ids: Set<string> }>({ filter, ids: new Set() });
  const keepIds = useMemo(() => (keep.filter === filter ? keep.ids : new Set<string>()), [keep, filter]);
  const [prevTasks, setPrevTasks] = useState(tasks);
  if (prevTasks !== tasks) {
    // Track tasks that flipped completion while visible.
    const before = new Map(prevTasks.map((t) => [t.id, t.completed]));
    const flipped = tasks.filter((t) => before.has(t.id) && before.get(t.id) !== t.completed).map((t) => t.id);
    if (flipped.length) setKeep({ filter, ids: new Set([...keepIds, ...flipped]) });
    setPrevTasks(tasks);
  }

  const visible = useMemo(() => filterByCompletion(tasks, filter, keepIds), [tasks, filter, keepIds]);
  const groups = useMemo(() => {
    const g: Record<string, Task[]> = { [NO_SECTION]: [] };
    for (const sec of project.sections) g[sec.id] = [];
    for (const t of visible) (g[t.sectionId ?? NO_SECTION] ?? g[NO_SECTION]).push(t);
    for (const list of Object.values(g)) list.sort((a, b) => a.position - b.position);
    return g;
  }, [visible, project.sections]);
  const update = useUpdateTask();
  const dnd = useSectionDnd(groups, (m) =>
    update.mutate({ id: m.taskId, patch: { sectionId: m.sectionId, position: m.position } }),
  );
  const unsectionedIds = dnd.items[NO_SECTION] ?? [];

  return (
    <div role="table" aria-label={`${project.name} tasks`} className="min-w-0 pb-24">
      <div role="rowgroup" className="sticky top-0 z-10 bg-white">
        <div role="row" className={clsx(GRID, 'border-b border-gray-200 text-xs text-gray-500')}>
          <div role="columnheader" className="py-2 pl-7">Task name</div>
          <div role="columnheader" className="px-2 py-2">
            <span className="hidden md:inline">Assignee</span>
          </div>
          <div role="columnheader" className="hidden px-2 py-2 md:block">Due date</div>
          <div role="columnheader" className="hidden px-2 py-2 md:block">Priority</div>
        </div>
      </div>

      <DndContext {...dnd.dndProps}>
        {(unsectionedIds.length > 0 || addingTo === '') && (
          <SectionBlock
            project={project}
            section={null}
            ids={unsectionedIds}
            byId={dnd.byId}
            canEdit={canEdit}
            adding={addingTo === ''}
            setAdding={(v) => setAddingTo(v ? '' : null)}
          />
        )}
        {project.sections.map((s) => (
          <SectionBlock
            key={s.id}
            project={project}
            section={s}
            ids={dnd.items[s.id] ?? []}
            byId={dnd.byId}
            canEdit={canEdit}
            adding={addingTo === s.id}
            setAdding={(v) => setAddingTo(v ? s.id : null)}
          />
        ))}
        <DragOverlay>
          {dnd.activeTask && (
            <div className="flex items-center gap-2 rounded border border-gray-200 bg-white py-1.5 pl-6 pr-3 text-sm shadow-lg">
              <GripIcon className="h-3.5 w-3.5 text-gray-400" />
              {dnd.activeTask.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {canEdit &&
        (newSection ? (
          <div className="py-2 pl-8">
            <input
              autoFocus
              aria-label="New section name"
              placeholder="Section name"
              className="rounded border border-blue-500 px-1 py-0.5 text-base font-semibold focus:outline-none"
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
          </div>
        ) : (
          <button
            type="button"
            className="ml-2 mt-2 flex items-center gap-1 rounded px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            onClick={() => setNewSection(true)}
          >
            <PlusIcon /> Add section
          </button>
        ))}
    </div>
  );
}
