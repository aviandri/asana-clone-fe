import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { tasksApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { Task } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { InlineText } from '@/components/InlineText';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from '@/components/icons';
import { EmptyState, ErrorState } from '@/components/PageHeader';
import { FullPageSpinner } from '@/components/Spinner';
import { BUCKETS, groupByBucket } from '@/lib/buckets';
import { filterByCompletion, type CompletionFilter } from '@/lib/taskFilters';
import { QuickAddRow } from '@/projects/ListView';
import { CompleteToggle, DueDateField, PrioritySelect } from '@/tasks/fields';
import { useCreateTask, useUpdateTask } from '@/tasks/useTaskMutations';
import { useTaskPanel } from '@/tasks/useTaskPanel';

const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_12rem_8rem_7rem] items-center';

function MyTaskRow({ task }: { task: Task }) {
  const update = useUpdateTask();
  const panel = useTaskPanel();
  const [renaming, setRenaming] = useState(false);
  return (
    <div
      role="row"
      aria-selected={panel.taskId === task.id}
      onClick={() => panel.open(task.id)}
      className={clsx(GRID, 'group cursor-pointer border-b border-gray-100 text-sm hover:bg-gray-50', panel.taskId === task.id && 'bg-blue-50')}
    >
      <div role="cell" className="flex min-w-0 items-center gap-2 py-1.5 pl-6 pr-2">
        <CompleteToggle
          completed={task.completed}
          label={task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
          onToggle={() => update.mutate({ id: task.id, patch: { completed: !task.completed } })}
        />
        {renaming ? (
          <InlineText
            autoFocus
            label="Task name"
            value={task.title}
            className="flex-1"
            onCommit={(title) => update.mutate({ id: task.id, patch: { title } })}
            onDone={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            className={clsx('min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left', task.completed && 'text-gray-500 line-through')}
            onClick={(e) => {
              e.stopPropagation();
              panel.open(task.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
          >
            {task.title}
          </button>
        )}
        {task.parentId && <span className="shrink-0 text-xs text-gray-400">subtask</span>}
      </div>
      <div role="cell" className="hidden min-w-0 px-2 md:block">
        {task.project ? (
          <Link
            to={`/projects/${task.project.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-xs text-gray-700 hover:brightness-95"
            style={{ backgroundColor: `${task.project.color}26` }}
          >
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: task.project.color }} />
            <span className="truncate">{task.project.name}</span>
          </Link>
        ) : (
          <span className="text-xs text-gray-400">Personal</span>
        )}
      </div>
      <div role="cell" className="px-2">
        <DueDateField
          value={task.dueDate}
          completed={task.completed}
          onChange={(dueDate) => update.mutate({ id: task.id, patch: { dueDate } })}
        />
      </div>
      <div role="cell" className="hidden px-2 md:block">
        <PrioritySelect
          value={task.priority}
          label={`Priority for ${task.title}`}
          onChange={(priority) => update.mutate({ id: task.id, patch: { priority } })}
        />
      </div>
    </div>
  );
}

function Bucket({ label, tasks, children }: { label: string; tasks: Task[]; children?: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  if (tasks.length === 0 && !children) return null;
  const id = `bucket-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="mb-2">
      <div className="flex items-center gap-1 py-2 pl-1">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
          className="rounded p-1 text-gray-500 hover:bg-gray-100"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        </button>
        <h2 id={id} className="px-1 text-base font-semibold">
          {label}
        </h2>
        <span className="text-xs text-gray-400">{tasks.length}</span>
      </div>
      {!collapsed && (
        <div role="rowgroup">
          {children}
          {tasks.map((t) => (
            <MyTaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </section>
  );
}

export function MyTasksPage() {
  const me = useCurrentUser();
  const [filter, setFilter] = useState<CompletionFilter>('incomplete');
  const [adding, setAdding] = useState(false);
  const create = useCreateTask();
  const tasks = useQuery({ queryKey: qk.myTasks, queryFn: () => tasksApi.mine().then((r) => r.data) });

  const groups = useMemo(() => groupByBucket(filterByCompletion(tasks.data ?? [], filter, new Set())), [tasks.data, filter]);
  const total = Object.values(groups).reduce((n, l) => n + l.length, 0);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <Avatar user={me} size="lg" />
          <h1 className="text-xl font-semibold text-gray-900">My tasks</h1>
        </div>
      </header>
      <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-2">
        <button type="button" className="btn-primary py-1" onClick={() => setAdding(true)}>
          <PlusIcon className="h-3.5 w-3.5" /> Add task
        </button>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Show</span>
          <select className="rounded border border-gray-300 px-1.5 py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value as CompletionFilter)}>
            <option value="incomplete">Incomplete tasks</option>
            <option value="completed">Completed tasks</option>
            <option value="all">All tasks</option>
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-24">
        {tasks.isLoading ? (
          <FullPageSpinner />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} />
        ) : (
          <div role="table" aria-label="My tasks">
            <div role="rowgroup" className="sticky top-0 z-10 bg-white">
              <div role="row" className={clsx(GRID, 'border-b border-gray-200 text-xs text-gray-500')}>
                <div role="columnheader" className="py-2 pl-7">Task name</div>
                <div role="columnheader" className="hidden px-2 py-2 md:block">Project</div>
                <div role="columnheader" className="px-2 py-2">Due date</div>
                <div role="columnheader" className="hidden px-2 py-2 md:block">Priority</div>
              </div>
            </div>
            {BUCKETS.map((b) => (
              <Bucket key={b.key} label={b.label} tasks={groups[b.key]}>
                {b.key === 'none' && adding ? (
                  <QuickAddRow
                    onClose={() => setAdding(false)}
                    onSubmit={(title) => create.mutate({ title, assigneeId: me.id })}
                  />
                ) : undefined}
              </Bucket>
            ))}
            {total === 0 && !adding && (
              <EmptyState title={filter === 'completed' ? 'No completed tasks yet' : 'You’re all caught up'}>
                Tasks assigned to you show up here.
              </EmptyState>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
