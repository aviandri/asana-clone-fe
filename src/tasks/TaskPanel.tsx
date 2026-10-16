import clsx from 'clsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useProject, useTask } from '@/api/hooks';
import type { TaskDetail } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { Popover } from '@/components/Popover';
import { Spinner } from '@/components/Spinner';
import { DotsIcon, PlusIcon, XIcon } from '@/components/icons';
import { errorMessage } from '@/lib/errors';
import { canEditProjectContent } from '@/lib/permissions';
import { positionAtEnd } from '@/lib/position';
import { AssigneeField, CompleteToggle, DueDateField, PrioritySelect, UserPickerList } from './fields';
import { useCreateTask, useDeleteTask, useFollowTask, useUpdateTask } from './useTaskMutations';
import { useTaskPanel } from './useTaskPanel';

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 py-1">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function AutoTextarea({
  value,
  onCommit,
  disabled,
  label,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      className={clsx(
        'w-full resize-none overflow-hidden rounded border border-transparent bg-transparent px-2 py-1 hover:border-gray-300 focus:border-blue-500 focus:outline-none disabled:hover:border-transparent',
        className,
      )}
    />
  );
}

function SubtaskList({ task, canEdit }: { task: TaskDetail; canEdit: boolean }) {
  const update = useUpdateTask();
  const create = useCreateTask();
  const panel = useTaskPanel();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const submit = () => {
    const t = title.trim();
    if (t) create.mutate({ title: t, parentId: task.id, projectId: task.projectId, position: positionAtEnd(task.subtasks) });
    setTitle('');
  };

  return (
    <section aria-label="Subtasks" className="mt-6">
      <h3 className="mb-1 text-sm font-semibold text-gray-700">Subtasks</h3>
      <ul className="divide-y divide-gray-100 rounded border border-gray-100">
        {task.subtasks.map((s) => (
          <li key={s.id} className="group flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50">
            <CompleteToggle
              size="sm"
              completed={s.completed}
              label={s.completed ? `Mark subtask "${s.title}" incomplete` : `Mark subtask "${s.title}" complete`}
              onToggle={() => canEdit && update.mutate({ id: s.id, patch: { completed: !s.completed } })}
            />
            <button
              type="button"
              className={clsx('min-w-0 flex-1 truncate text-left hover:underline', s.completed && 'text-gray-500 line-through')}
              onClick={() => panel.open(s.id)}
            >
              {s.title}
            </button>
            <DueDateField
              value={s.dueDate}
              completed={s.completed}
              disabled={!canEdit}
              onChange={(dueDate) => update.mutate({ id: s.id, patch: { dueDate } })}
            />
            <AssigneeField
              assignee={s.assignee}
              disabled={!canEdit}
              onChange={(u) => update.mutateAsync({ id: s.id, patch: { assigneeId: u?.id ?? null }, assignee: u })}
            />
          </li>
        ))}
        {adding && (
          <li className="flex items-center gap-2 px-2 py-1.5">
            <span className="h-4 w-4 shrink-0 rounded-full border border-dashed border-gray-300" />
            <input
              autoFocus
              aria-label="New subtask name"
              placeholder="Write a subtask name"
              className="min-w-0 flex-1 rounded border border-blue-500 px-1 py-0.5 text-sm focus:outline-none"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                submit();
                setAdding(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (title.trim()) submit();
                  else setAdding(false);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setTitle('');
                  setAdding(false);
                }
              }}
            />
          </li>
        )}
      </ul>
      {canEdit && !adding && (
        <button type="button" className="btn-ghost mt-1 px-2 py-1 text-xs" onClick={() => setAdding(true)}>
          <PlusIcon className="h-3.5 w-3.5" /> Add subtask
        </button>
      )}
    </section>
  );
}

function Followers({ task }: { task: TaskDetail }) {
  const me = useCurrentUser();
  const follow = useFollowTask();
  const [picking, setPicking] = useState(false);
  const following = task.followers.some((f) => f.id === me.id);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 px-6 py-3">
      <span className="text-sm text-gray-500">Collaborators</span>
      <div className="flex -space-x-1" aria-label="Followers">
        {task.followers.map((f) => (
          <Avatar key={f.id} user={f} size="sm" className="ring-2 ring-white" />
        ))}
      </div>
      <span className="relative">
        <button
          type="button"
          aria-label="Add collaborator"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-400 text-gray-500 hover:border-gray-600 hover:text-gray-700"
          onClick={() => setPicking((p) => !p)}
        >
          <PlusIcon className="h-3 w-3" />
        </button>
        <Popover open={picking} onClose={() => setPicking(false)} placement="top">
          <UserPickerList
            allowNone={false}
            excludeIds={task.followers.map((f) => f.id)}
            onPick={(u) => {
              setPicking(false);
              if (u) follow.mutate({ id: task.id, userId: u.id, follow: true });
            }}
          />
        </Popover>
      </span>
      {follow.isError && (
        <span role="alert" className="text-xs text-red-600">
          {errorMessage(follow.error)}
        </span>
      )}
      <div className="flex-1" />
      <button
        type="button"
        className="btn-secondary py-1 text-xs"
        aria-pressed={following}
        onClick={() => follow.mutate({ id: task.id, userId: me.id, follow: !following })}
      >
        {following ? 'Leave task' : 'Follow task'}
      </button>
    </div>
  );
}

function TaskMenu({ task, onDeleted, canEdit }: { task: TaskDetail; onDeleted: () => void; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const del = useDeleteTask();
  const [copied, setCopied] = useState(false);
  return (
    <span className="relative">
      <button type="button" aria-label="More task actions" className="btn-ghost p-1.5" onClick={() => setOpen((o) => !o)}>
        <DotsIcon />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="right" className="w-48">
        <button
          type="button"
          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
          onClick={() => {
            const url = `${location.origin}${location.pathname}?task=${task.id}`;
            void navigator.clipboard?.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? 'Link copied!' : 'Copy task link'}
        </button>
        {canEdit && (
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-gray-100"
            onClick={() => {
              setOpen(false);
              const extra = task.subtaskCount ? ` and its ${task.subtaskCount} subtask(s)` : '';
              if (window.confirm(`Delete "${task.title}"${extra}? This can’t be undone.`)) {
                del.mutate(task, { onSuccess: onDeleted });
              }
            }}
          >
            Delete task
          </button>
        )}
      </Popover>
    </span>
  );
}

/** Extra content rendered under the task body (comments & activity feed). */
export type TaskPanelSlot = (task: TaskDetail, canEdit: boolean) => ReactNode;

export function TaskPanel({ taskId, footer }: { taskId: string; footer?: TaskPanelSlot }) {
  const panel = useTaskPanel();
  const { close } = panel;
  const me = useCurrentUser();
  const task = useTask(taskId);
  const project = useProject(task.data?.projectId ?? undefined);
  const update = useUpdateTask();

  // Escape closes the panel (inputs stop propagation for their own Escape handling).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      if (e.key === 'Escape' && !typing && !e.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  const header = (actions?: ReactNode) => (
    <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
      {actions}
      <div className="flex-1" />
      <button type="button" aria-label="Close task details" className="btn-ghost p-1.5" onClick={panel.close}>
        <XIcon />
      </button>
    </div>
  );

  if (task.isLoading) {
    return (
      <div className="flex h-full flex-col">
        {header()}
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      </div>
    );
  }
  if (task.isError || !task.data) {
    const notFound = task.error instanceof ApiError && task.error.status === 404;
    return (
      <div className="flex h-full flex-col">
        {header()}
        <p className="p-6 text-sm text-gray-600">{notFound ? 'This task doesn’t exist or you don’t have access to it.' : 'Could not load this task.'}</p>
      </div>
    );
  }

  const t = task.data;
  const canEdit = t.projectId ? canEditProjectContent(project.data, me) : true;
  const sections = project.data?.sections ?? [];

  return (
    <div className="flex h-full flex-col" role="dialog" aria-modal="false" aria-label={t.title}>
      {header(
        <>
          <button
            type="button"
            disabled={!canEdit}
            aria-pressed={t.completed}
            onClick={() => update.mutate({ id: t.id, patch: { completed: !t.completed } })}
            className={clsx(
              'btn border py-1 text-xs',
              t.completed ? 'border-green-600 bg-green-50 text-green-700' : 'border-gray-300 text-gray-700 hover:border-green-600 hover:text-green-700',
            )}
          >
            ✓ {t.completed ? 'Completed' : 'Mark complete'}
          </button>
          <TaskMenu task={t} canEdit={canEdit} onDeleted={panel.close} />
        </>,
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-6 pb-6 pt-4">
          {t.parent && (
            <button type="button" className="mb-1 text-xs text-gray-500 hover:underline" onClick={() => panel.open(t.parent!.id)}>
              ‹ {t.parent.title}
            </button>
          )}
          <AutoTextarea
            label="Task title"
            value={t.title}
            disabled={!canEdit}
            onCommit={(v) => v.trim() && update.mutate({ id: t.id, patch: { title: v.trim() } })}
            className="-mx-2 text-2xl font-semibold"
          />

          <div className="mt-4">
            <FieldRow label="Assignee">
              <AssigneeField
                variant="field"
                assignee={t.assignee}
                disabled={!canEdit}
                onChange={(u) => update.mutateAsync({ id: t.id, patch: { assigneeId: u?.id ?? null }, assignee: u })}
              />
            </FieldRow>
            <FieldRow label="Due date">
              <DueDateField
                variant="field"
                value={t.dueDate}
                completed={t.completed}
                disabled={!canEdit}
                onChange={(dueDate) => update.mutate({ id: t.id, patch: { dueDate } })}
              />
            </FieldRow>
            <FieldRow label="Project">
              {t.project ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link to={`/projects/${t.project.id}`} className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-gray-100">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: t.project.color }} />
                    {t.project.name}
                  </Link>
                  {!t.parentId && (
                    <select
                      aria-label="Section"
                      disabled={!canEdit}
                      className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-700"
                      value={t.sectionId ?? ''}
                      onChange={(e) => update.mutate({ id: t.id, patch: { sectionId: e.target.value || null } })}
                    >
                      <option value="">(No section)</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <span className="px-1 text-sm text-gray-500">My tasks only</span>
              )}
            </FieldRow>
            <FieldRow label="Priority">
              <PrioritySelect
                value={t.priority}
                disabled={!canEdit}
                onChange={(priority) => update.mutate({ id: t.id, patch: { priority } })}
              />
            </FieldRow>
          </div>

          <section className="mt-6">
            <h3 className="mb-1 text-sm font-semibold text-gray-700">Description</h3>
            <AutoTextarea
              label="Description"
              value={t.description ?? ''}
              disabled={!canEdit}
              placeholder="What is this task about?"
              onCommit={(v) => update.mutate({ id: t.id, patch: { description: v.trim() ? v : null } })}
              className="-mx-2 min-h-[4rem] text-sm"
            />
          </section>

          {!t.parentId && <SubtaskList task={t} canEdit={canEdit} />}

          {footer?.(t, canEdit)}
        </div>
      </div>
      <Followers task={t} />
    </div>
  );
}
