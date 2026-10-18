import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useUsers } from '@/api/hooks';
import type { Priority, UserSummary } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Popover } from '@/components/Popover';
import { CalendarIcon, XIcon } from '@/components/icons';
import { dueTone, formatDue } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { PRIORITY_LABEL } from '@/lib/priority';

export function CompleteToggle({
  completed,
  onToggle,
  size = 'md',
  label,
}: {
  completed: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full border transition-colors',
        size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]',
        completed
          ? 'border-green-600 bg-green-600 text-white'
          : 'border-gray-400 text-transparent hover:border-green-600 hover:text-green-600',
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        <path d="m4 8.5 2.5 2.5L12 5.5" />
      </svg>
    </button>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  NONE: 'bg-transparent text-gray-500',
  LOW: 'bg-teal-100 text-teal-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-purple-100 text-purple-800',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'NONE') return null;
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_STYLE[priority])}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function PrioritySelect({
  value,
  onChange,
  disabled,
  className,
  label = 'Priority',
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <select
      aria-label={label}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value as Priority)}
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        'cursor-pointer appearance-none rounded-full border-0 px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-default',
        PRIORITY_STYLE[value],
        value === 'NONE' && 'hover:bg-gray-100',
        className,
      )}
    >
      {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
        <option key={p} value={p}>
          {p === 'NONE' ? '—' : PRIORITY_LABEL[p]}
        </option>
      ))}
    </select>
  );
}

export function DueDateField({
  value,
  completed,
  onChange,
  disabled,
  label = 'Due date',
  variant = 'inline',
}: {
  value: string | null;
  completed?: boolean;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  label?: string;
  variant?: 'inline' | 'field';
}) {
  const [editing, setEditing] = useState(false);
  if (editing && !disabled) {
    return (
      <input
        type="date"
        aria-label={label}
        autoFocus
        defaultValue={value ?? ''}
        className="w-36 rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-primary-500 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') setEditing(false);
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v)) onChange(v || null);
        }}
      />
    );
  }
  return (
    <span className="group/due inline-flex items-center gap-1">
      <button
        type="button"
        aria-label={value ? `${label}: ${formatDue(value)}` : `Set ${label.toLowerCase()}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className={clsx(
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-gray-100 disabled:hover:bg-transparent',
          value ? dueTone(value, completed) : 'text-gray-500',
          variant === 'field' && 'text-sm',
        )}
      >
        {value ? (
          formatDue(value)
        ) : (
          <>
            <CalendarIcon className="h-3.5 w-3.5" />
            {variant === 'field' && <span>No due date</span>}
          </>
        )}
      </button>
      {value && !disabled && variant === 'field' && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          onClick={() => onChange(null)}
        >
          <XIcon className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function UserPickerList({
  onPick,
  selectedId,
  allowNone = true,
  excludeIds = [],
}: {
  onPick: (u: UserSummary | null) => void;
  selectedId?: string | null;
  allowNone?: boolean;
  excludeIds?: string[];
}) {
  const users = useUsers();
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (users.data ?? [])
      .filter((u) => !excludeIds.includes(u.id))
      .filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s))
      .slice(0, 20);
  }, [users.data, q, excludeIds]);
  return (
    <div className="w-64" onClick={(e) => e.stopPropagation()}>
      <div className="px-2 pb-1">
        <input
          autoFocus
          aria-label="Search people"
          placeholder="Name or email"
          className="input py-1.5"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered[0]) {
              e.preventDefault();
              onPick(filtered[0]);
            }
          }}
        />
      </div>
      <ul role="listbox" aria-label="People" className="max-h-64 overflow-y-auto">
        {allowNone && selectedId && (
          <li>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100" onClick={() => onPick(null)}>
              <Avatar user={null} size="sm" /> Unassign
            </button>
          </li>
        )}
        {filtered.map((u) => (
          <li key={u.id} role="option" aria-selected={u.id === selectedId}>
            <button
              type="button"
              className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100', u.id === selectedId && 'bg-primary-50')}
              onClick={() => onPick(u)}
            >
              <Avatar user={u} size="sm" />
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span className="truncate text-xs text-gray-500">{u.email}</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No matches</li>}
      </ul>
    </div>
  );
}

export function AssigneeField({
  assignee,
  onChange,
  disabled,
  variant = 'inline',
}: {
  assignee: UserSummary | null;
  /** May return a promise; a rejection is shown inline (e.g. 400 "user can't see this project"). */
  onChange: (u: UserSummary | null) => unknown;
  disabled?: boolean;
  variant?: 'inline' | 'field';
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        aria-label={assignee ? `Assignee: ${assignee.name}` : 'Assign'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-sm hover:bg-gray-100 disabled:hover:bg-transparent"
      >
        <Avatar user={assignee} size="sm" />
        {variant === 'field' && <span className={clsx('truncate', !assignee && 'text-gray-500')}>{assignee?.name ?? 'No assignee'}</span>}
        {variant === 'inline' && assignee && <span className="hidden truncate text-xs text-gray-700 xl:inline">{assignee.name.split(' ')[0]}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)}>
        <UserPickerList
          selectedId={assignee?.id ?? null}
          onPick={(u) => {
            setOpen(false);
            setError(null);
            if ((u?.id ?? null) === (assignee?.id ?? null)) return;
            Promise.resolve(onChange(u)).catch((err: unknown) => setError(errorMessage(err, 'Could not assign')));
          }}
        />
      </Popover>
      {error && (
        <span role="alert" className="max-w-[14rem] text-xs text-red-600" onClick={(e) => e.stopPropagation()}>
          {error}
          <button type="button" aria-label="Dismiss" className="ml-1 text-red-400 hover:text-red-700" onClick={() => setError(null)}>
            ×
          </button>
        </span>
      )}
    </span>
  );
}
