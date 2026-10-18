import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { teamsApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { Goal } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { EmptyState, ErrorState, PageHeader } from '@/components/PageHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { PlusIcon, TargetIcon } from '@/components/icons';
import { buildGoalTree } from '@/lib/goals';
import { currentQuarter, defaultPeriods, periodLabel, sortPeriods } from '@/lib/periods';
import { showToast } from '@/lib/toast';
import { GoalTree } from './GoalTree';
import { NewGoalDialog } from './NewGoalDialog';
import { useGoals, useTimePeriods } from './useGoals';

export type GoalFilter = 'all' | 'company' | 'team' | 'mine';
const FILTERS: { key: GoalFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'company', label: 'Company' },
  { key: 'team', label: 'My team' },
  { key: 'mine', label: 'Mine' },
];

export function GoalsPage() {
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const period = params.get('period') ?? currentQuarter();
  const filter = (params.get('filter') as GoalFilter | null) ?? 'all';
  const setParam = (k: string, v: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set(k, v);
      return next;
    });
  const [creating, setCreating] = useState(false);

  const goals = useGoals(period);
  const periods = useTimePeriods();
  const myTeams = useQuery({ queryKey: qk.teams(true), queryFn: () => teamsApi.list(true).then((r) => r.data) });

  const filtered = useMemo(() => {
    const myTeamIds = new Set((myTeams.data ?? []).map((t) => t.id));
    const keep = (g: Goal) =>
      filter === 'all' ||
      (filter === 'company' && g.isCompany) ||
      (filter === 'team' && !!g.team && myTeamIds.has(g.team.id)) ||
      (filter === 'mine' && g.owner.id === me.id);
    return (goals.data ?? []).filter(keep);
  }, [goals.data, filter, myTeams.data, me.id]);
  const roots = useMemo(() => buildGoalTree(filtered), [filtered]);
  const avg = filtered.length ? filtered.reduce((n, g) => n + g.progress, 0) / filtered.length : 0;
  const periodOptions = sortPeriods([...(periods.data ?? []), ...defaultPeriods(), period]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Goals"
        icon={<TargetIcon className="h-6 w-6 text-gray-500" />}
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon className="h-3.5 w-3.5" /> New goal
          </button>
        }
      />
      {creating && (
        <NewGoalDialog
          defaultPeriod={period}
          onClose={() => setCreating(false)}
          onCreated={(g) => {
            if (g.timePeriod !== period) setParam('period', g.timePeriod);
            showToast(`Goal “${g.title}” created`, 'info');
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-6 py-2">
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <span>Time period</span>
          <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={period} onChange={(e) => setParam('period', e.target.value)}>
            {periodOptions.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Filter goals" className="flex rounded-md border border-gray-200 text-sm">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setParam('filter', f.key)}
              className={clsx('px-3 py-1 first:rounded-l-md last:rounded-r-md', filter === f.key ? 'bg-gray-900 text-white' : 'hover:bg-gray-50')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {filtered.length > 0 && (
          <span className="text-sm text-gray-500">
            {filtered.length} goal{filtered.length === 1 ? '' : 's'} · avg. {Math.round(avg)}% complete
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {goals.isLoading ? (
          <ListSkeleton label="Loading goals" rows={6} />
        ) : goals.isError ? (
          <ErrorState error={goals.error} />
        ) : roots.length === 0 ? (
          <EmptyState illustration="goals" title={`No goals for ${periodLabel(period)}`}>
            {filter === 'all' ? 'Set a goal to rally the team — align it to a parent and progress flows up the cascade.' : 'Nothing matches this filter. Try “All”.'}
          </EmptyState>
        ) : (
          <div className="pb-16">
            <div className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1fr)_7rem_10rem_6.5rem] gap-3 border-b border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-500 md:grid" aria-hidden>
              <span>Goal</span>
              <span>Owner</span>
              <span>Progress</span>
              <span>Status</span>
            </div>
            <GoalTree roots={roots} />
          </div>
        )}
      </div>
    </div>
  );
}
