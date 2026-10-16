import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { reportsApi } from '@/api/endpoints';
import { useTeams } from '@/api/hooks';
import { qk } from '@/api/queryKeys';
import type { GoalStatus } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { ChartIcon } from '@/components/icons';
import { ErrorState, PageHeader } from '@/components/PageHeader';
import { FullPageSpinner } from '@/components/Spinner';
import { ProgressBar, StatusPill } from '@/goals/GoalBits';
import { useGoals, useTimePeriods } from '@/goals/useGoals';
import { timeAgo, toDateOnly } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { GOAL_STATUSES } from '@/lib/goals';
import { currentQuarter, defaultPeriods, periodLabel, sortPeriods } from '@/lib/periods';
import { ChartCard, KpiTile } from './ChartCard';
import { HBarStack } from './charts';
import { SERIES } from './palette';

type Tab = 'overview' | 'workload' | 'goals';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'workload', label: 'Workload' },
  { key: 'goals', label: 'Goals' },
];

function TeamFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const teams = useTeams();
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-600">
      Team
      <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All teams</option>
        {(teams.data ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function OverviewTab({ teamId }: { teamId: string }) {
  const overview = useQuery({ queryKey: qk.overview(teamId || undefined), queryFn: () => reportsApi.overview(teamId || undefined), placeholderData: (p) => p });
  if (overview.isLoading) return <FullPageSpinner />;
  if (overview.isError) return <ErrorState error={overview.error} />;
  const o = overview.data!;
  return (
    <div className={clsx('space-y-4', overview.isPlaceholderData && 'opacity-60')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Projects" value={o.totals.projects} />
        <KpiTile label="Total tasks" value={o.totals.total} />
        <KpiTile label="Completed" value={o.totals.completed} hint={o.totals.total ? `${Math.round((o.totals.completed / o.totals.total) * 100)}% complete` : undefined} />
        <KpiTile label="Overdue" value={o.totals.overdue} tone={o.totals.overdue ? 'bad' : undefined} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Projects overview</caption>
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Project</th>
              <th scope="col" className="w-48 px-3 py-2 font-medium">% complete</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Tasks</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Incomplete</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Overdue</th>
              <th scope="col" className="px-3 py-2 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 tabular-nums">
            {o.projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No projects.
                </td>
              </tr>
            )}
            {o.projects.map((row) => (
              <tr key={row.project.id}>
                <th scope="row" className="px-3 py-2 font-normal">
                  <Link to={`/projects/${row.project.id}/dashboard`} className="flex items-center gap-2 hover:underline">
                    <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: row.project.color }} aria-hidden />
                    <span className="truncate">{row.project.name}</span>
                  </Link>
                </th>
                <td className="px-3 py-2">
                  <ProgressBar value={row.percentComplete} label={`${row.project.name} percent complete`} />
                </td>
                <td className="px-3 py-2 text-right">{row.total}</td>
                <td className="px-3 py-2 text-right">{row.incomplete}</td>
                <td className={clsx('px-3 py-2 text-right', row.overdue > 0 && 'font-medium text-red-700')}>{row.overdue}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{row.lastActivityAt ? timeAgo(row.lastActivityAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function rangePresets(now = new Date()) {
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return [
    { label: 'This week', from: toDateOnly(monday), to: toDateOnly(addDays(monday, 6)) },
    { label: 'Next week', from: toDateOnly(addDays(monday, 7)), to: toDateOnly(addDays(monday, 13)) },
    { label: 'This month', from: toDateOnly(startOfMonth(now)), to: toDateOnly(endOfMonth(now)) },
    { label: 'Next 30 days', from: toDateOnly(now), to: toDateOnly(addDays(now, 29)) },
  ];
}

function WorkloadTab({ teamId }: { teamId: string }) {
  const me = useCurrentUser();
  const presets = useMemo(() => rangePresets(), []);
  const [range, setRange] = useState({ from: presets[0].from, to: presets[0].to });
  const valid = range.from && range.to && range.from <= range.to;
  const q = { teamId: teamId || undefined, from: range.from, to: range.to };
  const workload = useQuery({ queryKey: qk.workload(q), queryFn: () => reportsApi.workload(q), enabled: !!valid, placeholderData: (p) => p });
  const active = presets.find((p) => p.from === range.from && p.to === range.to)?.label;
  const rows = workload.data?.data ?? [];
  const chartRows = rows.filter((r) => r.open > 0).map((r) => ({ name: r.user.name, overdue: r.overdue, onTime: r.open - r.overdue }));
  const fmt = (d: string) => format(parseISO(d), 'MMM d');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Date range presets" className="flex rounded-md border border-gray-200 text-sm">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={active === p.label}
              className={clsx('px-3 py-1 first:rounded-l-md last:rounded-r-md', active === p.label ? 'bg-gray-900 text-white' : 'hover:bg-gray-50')}
              onClick={() => setRange({ from: p.from, to: p.to })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="text-sm text-gray-600">
          <span className="block text-xs">From</span>
          <input type="date" className="rounded border border-gray-300 px-2 py-1 text-sm" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </label>
        <label className="text-sm text-gray-600">
          <span className="block text-xs">To</span>
          <input type="date" className="rounded border border-gray-300 px-2 py-1 text-sm" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </label>
      </div>
      {!valid && <p role="alert" className="text-sm text-red-600">Pick a start date on or before the end date.</p>}
      {me.role !== 'ADMIN' && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Workload only counts tasks you can see, so it may not show everyone’s full load. Admins see the complete picture.
        </p>
      )}
      {workload.isError ? (
        <p role="alert" className="text-sm text-red-600">{errorMessage(workload.error)}</p>
      ) : workload.isLoading ? (
        <FullPageSpinner />
      ) : (
        <div className={clsx('grid gap-4 lg:grid-cols-[1fr_1fr]', workload.isPlaceholderData && 'opacity-60')}>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <caption className="px-3 pt-3 text-left text-sm font-semibold text-gray-900">
                Workload {workload.data && `· ${fmt(workload.data.from)} – ${fmt(workload.data.to)}`}
              </caption>
              <thead className="text-xs text-gray-500">
                <tr className="border-b border-gray-200">
                  <th scope="col" className="px-3 py-2 font-medium">Person</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Open</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Overdue</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Due this period</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Completed this period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 tabular-nums">
                {rows.map((r) => (
                  <tr key={r.user.id}>
                    <th scope="row" className="px-3 py-2 font-normal">
                      <span className="flex items-center gap-2">
                        <Avatar user={r.user} size="xs" />
                        <span className="truncate">{r.user.name}</span>
                      </span>
                    </th>
                    <td className="px-3 py-2 text-right">{r.open}</td>
                    <td className={clsx('px-3 py-2 text-right', r.overdue > 0 && 'font-medium text-red-700')}>{r.overdue}</td>
                    <td className="px-3 py-2 text-right">{r.dueInRange}</td>
                    <td className="px-3 py-2 text-right">{r.completedInRange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ChartCard
            title="Open tasks per person"
            summary="Open tasks split into overdue and not yet overdue."
            legend={[
              { label: 'Not overdue', color: SERIES.slot1 },
              { label: 'Overdue', color: SERIES.slot2 },
            ]}
            table={{ columns: ['Person', 'Not overdue', 'Overdue'], rows: chartRows.map((r) => [r.name, r.onTime, r.overdue]) }}
            empty={chartRows.length === 0}
          >
            <HBarStack
              data={chartRows}
              categoryKey="name"
              series={[
                { key: 'onTime', label: 'Not overdue', color: SERIES.slot1 },
                { key: 'overdue', label: 'Overdue', color: SERIES.slot2 },
              ]}
            />
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function GoalsTab() {
  const [period, setPeriod] = useState(currentQuarter());
  const goals = useGoals(period);
  const periods = useTimePeriods();
  const list = goals.data ?? [];
  const avg = list.length ? list.reduce((n, g) => n + g.progress, 0) / list.length : 0;
  const byStatus = GOAL_STATUSES.map((s) => ({ status: s, count: list.filter((g) => g.status === s).length })).filter((s) => s.count > 0);
  const max = Math.max(1, ...byStatus.map((s) => s.count));
  const company = list.filter((g) => g.isCompany);
  const atRisk = list.filter((g) => (['AT_RISK', 'OFF_TRACK'] as GoalStatus[]).includes(g.status));

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-1.5 text-sm text-gray-600">
        Time period
        <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {sortPeriods([...(periods.data ?? []), ...defaultPeriods(), period]).map((p) => (
            <option key={p} value={p}>
              {periodLabel(p)}
            </option>
          ))}
        </select>
      </label>
      {goals.isLoading ? (
        <FullPageSpinner />
      ) : goals.isError ? (
        <ErrorState error={goals.error} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile label="Goals" value={list.length} hint={periodLabel(period)} />
            <KpiTile label="Average progress" value={`${Math.round(avg)}%`} />
            <KpiTile label="Company goals" value={company.length} hint={company.length ? `avg. ${Math.round(company.reduce((n, g) => n + g.progress, 0) / company.length)}%` : undefined} />
            <KpiTile label="At risk or off track" value={atRisk.length} tone={atRisk.length ? 'bad' : undefined} />
          </div>
          <section aria-labelledby="goals-by-status" className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 id="goals-by-status" className="mb-3 text-sm font-semibold">
              Goals by status
            </h3>
            {byStatus.length === 0 ? (
              <p className="text-sm text-gray-500">No goals in {periodLabel(period)}.</p>
            ) : (
              // A labelled list *is* the text alternative: each row states status, count and share.
              <ul aria-label="Goals by status" className="space-y-2">
                {byStatus.map((s) => (
                  <li key={s.status} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm">
                    <StatusPill status={s.status} />
                    <span className="h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                      <span className="block h-full rounded-full bg-gray-500" style={{ width: `${(s.count / max) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">
                      {s.count}
                      <span className="sr-only"> of {list.length} goals</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {atRisk.length > 0 && (
            <section aria-labelledby="goals-at-risk" className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 id="goals-at-risk" className="mb-2 text-sm font-semibold">
                Needs attention
              </h3>
              <ul className="divide-y divide-gray-100">
                {atRisk.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <Link to={`/goals/${g.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {g.title}
                    </Link>
                    <span className="hidden w-32 sm:block">
                      <ProgressBar value={g.progress} label={`${g.title} progress`} />
                    </span>
                    <StatusPill status={g.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function ReportingPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'overview') as Tab;
  const teamId = params.get('team') ?? '';
  const set = (k: string, v: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (v) next.set(k, v);
      else next.delete(k);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Reporting" icon={<ChartIcon className="h-6 w-6 text-gray-500" />}>
        <div role="tablist" aria-label="Reports" className="flex gap-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => set('tab', t.key)}
              className={clsx('-mb-px border-b-2 px-1 pb-2 text-sm', tab === t.key ? 'border-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </PageHeader>
      <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)!.label} className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          {tab !== 'goals' && <TeamFilter value={teamId} onChange={(v) => set('team', v)} />}
          {tab === 'overview' && <OverviewTab teamId={teamId} />}
          {tab === 'workload' && <WorkloadTab teamId={teamId} />}
          {tab === 'goals' && <GoalsTab />}
        </div>
      </div>
    </div>
  );
}
