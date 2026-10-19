import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import { Avatar } from '@/components/Avatar';
import { Modal } from '@/components/Modal';
import { Spinner } from '@/components/Spinner';
import { CheckCircleIcon, SearchIcon } from '@/components/icons';

type Item =
  | { kind: 'task'; id: string; label: string; sub: string; href: string; color?: string; completed: boolean }
  | { kind: 'project'; id: string; label: string; href: string; color: string }
  | { kind: 'user'; id: string; label: string; sub: string; href: string; color: string };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const GROUPS: { title: string; kind: Item['kind'] }[] = [
  { title: 'Tasks', kind: 'task' },
  { title: 'Projects', kind: 'project' },
  { title: 'People', kind: 'user' },
];

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounced(q.trim(), 200);
  const enabled = open && debounced.length >= 2;
  const results = useQuery({
    queryKey: qk.search(debounced),
    queryFn: () => searchApi.search(debounced),
    enabled,
    staleTime: 10_000,
  });

  const items = useMemo<Item[]>(() => {
    const r = results.data;
    if (!r || !enabled) return [];
    return [
      ...r.tasks.map<Item>((t) => ({
        kind: 'task',
        id: t.id,
        label: t.title,
        sub: t.project?.name ?? 'My tasks',
        color: t.project?.color,
        completed: t.completed,
        href: t.projectId ? `/projects/${t.projectId}/list?task=${t.id}` : `/my-tasks?task=${t.id}`,
      })),
      ...r.projects.map<Item>((p) => ({ kind: 'project', id: p.id, label: p.name, color: p.color, href: `/projects/${p.id}` })),
      ...r.users.map<Item>((u) => ({ kind: 'user', id: u.id, label: u.name, sub: u.email, color: u.avatarColor, href: `mailto:${u.email}` })),
    ];
  }, [results.data, enabled]);

  const close = () => {
    setQ('');
    setActive(0);
    onClose();
  };
  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    if (item.kind === 'user') window.location.href = item.href;
    else navigate(item.href);
  };

  return (
    <Modal open={open} onClose={close} title="Search" hideTitle position="top" width="xl">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <SearchIcon className="h-5 w-5 text-gray-500" />
        <input
          autoFocus
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="search-results"
          aria-activedescendant={items[active] ? `search-item-${active}` : undefined}
          aria-label="Search tasks, projects and people"
          placeholder="Search tasks, projects and people"
          className="flex-1 bg-transparent text-base focus:outline-none"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(items[active]);
            }
          }}
        />
        {results.isFetching && <Spinner className="h-4 w-4" />}
        <kbd className="hidden rounded border border-gray-200 px-1.5 text-xs text-gray-500 sm:inline">Esc</kbd>
      </div>
      <div id="search-results" role="listbox" aria-label="Search results" className="max-h-[60vh] overflow-y-auto py-2">
        {q.trim().length < 2 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">Type at least 2 characters to search.</p>
        ) : results.isError ? (
          <p className="px-4 py-6 text-center text-sm text-red-600">Search failed.</p>
        ) : enabled && !results.isLoading && items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">No results for “{debounced}”.</p>
        ) : (
          GROUPS.map((g) => {
            const groupItems = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === g.kind);
            if (groupItems.length === 0) return null;
            return (
              <div key={g.kind} role="group" aria-label={g.title}>
                <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.title}</div>
                {groupItems.map(({ it, i }) => (
                  <div
                    key={`${it.kind}-${it.id}`}
                    id={`search-item-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(it)}
                    className={clsx('mx-2 flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm', i === active && 'bg-primary-50')}
                  >
                    {it.kind === 'task' && <CheckCircleIcon className={clsx('h-4 w-4 shrink-0', it.completed ? 'text-green-600' : 'text-gray-500')} />}
                    {it.kind === 'project' && <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ backgroundColor: it.color }} />}
                    {it.kind === 'user' && <Avatar user={{ name: it.label, avatarColor: it.color }} size="xs" />}
                    <span className={clsx('min-w-0 flex-1 truncate', it.kind === 'task' && it.completed && 'text-gray-500 line-through')}>{it.label}</span>
                    {'sub' in it && (
                      <span className="flex max-w-[40%] items-center gap-1 truncate text-xs text-gray-500">
                        {it.kind === 'task' && it.color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: it.color }} />}
                        {it.sub}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
