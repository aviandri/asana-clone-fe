import clsx from 'clsx';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { ChevronDownIcon, ChevronRightIcon } from '@/components/icons';
import { goalLevelLabel, type GoalNode } from '@/lib/goals';
import { ProgressBar, StatusPill } from './GoalBits';

function flattenVisible(nodes: GoalNode[], collapsed: Set<string>, parent: string | null = null, out: { id: string; parent: string | null; hasKids: boolean }[] = []) {
  for (const n of nodes) {
    out.push({ id: n.goal.id, parent, hasKids: n.children.length > 0 });
    if (n.children.length && !collapsed.has(n.goal.id)) flattenVisible(n.children, collapsed, n.goal.id, out);
  }
  return out;
}

const domId = (id: string) => `goal-ti-${id}`;

/**
 * Accessible goal cascade (WAI-ARIA tree pattern): role=tree "Goals", each goal a treeitem named
 * by its title (aria-labelledby), children nested in a role=group. Roving tabindex; arrows move,
 * Right/Left expand/collapse, Home/End, Enter opens the goal.
 */
export function GoalTree({ roots }: { roots: GoalNode[] }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const visible = useMemo(() => flattenVisible(roots, collapsed), [roots, collapsed]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const activeId = focusId && visible.some((v) => v.id === focusId) ? focusId : (visible[0]?.id ?? null);

  const toggle = (id: string, open?: boolean) =>
    setCollapsed((c) => {
      const next = new Set(c);
      const isOpen = !next.has(id);
      if (open ?? !isOpen) next.delete(id);
      else next.add(id);
      return next;
    });
  const moveTo = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    document.getElementById(domId(id))?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!activeId || (e.target as HTMLElement).getAttribute('role') !== 'treeitem') return;
    const i = visible.findIndex((v) => v.id === activeId);
    const cur = visible[i];
    const handled = () => e.preventDefault();
    switch (e.key) {
      case 'ArrowDown':
        handled();
        moveTo(visible[i + 1]?.id);
        break;
      case 'ArrowUp':
        handled();
        moveTo(visible[i - 1]?.id);
        break;
      case 'Home':
        handled();
        moveTo(visible[0]?.id);
        break;
      case 'End':
        handled();
        moveTo(visible[visible.length - 1]?.id);
        break;
      case 'ArrowRight':
        handled();
        if (cur.hasKids && collapsed.has(cur.id)) toggle(cur.id, true);
        else if (cur.hasKids) moveTo(visible[i + 1]?.id);
        break;
      case 'ArrowLeft':
        handled();
        if (cur.hasKids && !collapsed.has(cur.id)) toggle(cur.id, false);
        else if (cur.parent) moveTo(cur.parent);
        break;
      case 'Enter':
        handled();
        navigate(`/goals/${cur.id}`);
        break;
    }
  };

  const renderNode = (n: GoalNode, level: number) => {
    const g = n.goal;
    const open = !collapsed.has(g.id);
    const titleId = `${domId(g.id)}-title`;
    return (
      <li
        key={g.id}
        id={domId(g.id)}
        role="treeitem"
        aria-labelledby={titleId}
        aria-level={level}
        aria-expanded={n.children.length ? open : undefined}
        aria-selected={activeId === g.id}
        tabIndex={activeId === g.id ? 0 : -1}
        onFocus={(e) => e.target === e.currentTarget && setFocusId(g.id)}
        className="outline-none [&:focus-visible>div]:ring-2 [&:focus-visible>div]:ring-blue-500"
      >
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-gray-100 py-2 pr-3 hover:bg-gray-50 md:grid-cols-[minmax(0,1fr)_7rem_10rem_6.5rem]"
          style={{ paddingLeft: `${(level - 1) * 1.5 + 0.5}rem` }}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {n.children.length ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={open ? `Collapse ${g.title}` : `Expand ${g.title}`}
                className="rounded p-0.5 text-gray-500 hover:bg-gray-200"
                onClick={() => toggle(g.id)}
              >
                {open ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-[1.125rem] shrink-0" />
            )}
            <div className="min-w-0">
              <Link id={titleId} to={`/goals/${g.id}`} tabIndex={-1} className="block truncate text-sm font-medium text-gray-900 hover:underline">
                {g.title}
              </Link>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{goalLevelLabel(g)}</span>
                {g.keyResultCount > 0 && <span>· {g.keyResultCount} key result{g.keyResultCount === 1 ? '' : 's'}</span>}
                {g.childCount > 0 && <span>· {g.childCount} sub-goal{g.childCount === 1 ? '' : 's'}</span>}
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 md:flex">
            <Avatar user={g.owner} size="xs" />
            <span className="truncate text-xs text-gray-600">{g.owner.name.split(' ')[0]}</span>
          </div>
          <ProgressBar value={g.progress} label={`${g.title} progress`} className="hidden md:flex" />
          <StatusPill status={g.status} className={clsx('justify-self-end md:justify-self-start')} />
        </div>
        {n.children.length > 0 && open && (
          <ul role="group">{n.children.map((c) => renderNode(c, level + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <ul role="tree" aria-label="Goals" onKeyDown={onKeyDown}>
      {roots.map((n) => renderNode(n, 1))}
    </ul>
  );
}
