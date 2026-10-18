import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { reportsApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { ProjectReport } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { ErrorState } from '@/components/PageHeader';
import { DashboardSkeleton } from '@/components/Skeleton';
import { dueTone, formatDue } from '@/lib/dates';
import { PRIORITY_LABEL } from '@/lib/priority';
import { useTaskPanel } from '@/tasks/useTaskPanel';
import { ChartCard, KpiTile } from './ChartCard';
import { HBarStack, TrendLines, VBarSingle } from './charts';
import { ExportCsvLink } from './ExportCsvLink';
import { SERIES } from './palette';

const weekLabel = (iso: string) => format(parseISO(iso), 'MMM d');

function Upcoming({ report }: { report: ProjectReport }) {
  const panel = useTaskPanel();
  return (
    <section aria-labelledby="dash-upcoming" className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 id="dash-upcoming" className="mb-2 text-sm font-semibold">
        Upcoming (next 14 days)
      </h3>
      {report.upcoming.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing due in the next two weeks.</p>
      ) : (
        <ul aria-label="Upcoming tasks" className="divide-y divide-gray-100">
          {report.upcoming.map((t) => (
            <li key={t.id}>
              <button type="button" className="flex w-full items-center gap-3 py-1.5 text-left text-sm hover:bg-gray-50" onClick={() => panel.open(t.id)}>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.assignee && <Avatar user={t.assignee} size="xs" />}
                <span className={`w-20 shrink-0 text-right text-xs ${dueTone(t.dueDate, t.completed)}`}>{formatDue(t.dueDate!)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ProjectDashboard({ projectId }: { projectId: string }) {
  const [weeks, setWeeks] = useState(12);
  const report = useQuery({
    queryKey: qk.projectReport(projectId, weeks),
    queryFn: () => reportsApi.project(projectId, weeks),
    placeholderData: (prev) => prev, // hold the previous render while a new range loads
  });

  if (report.isLoading) return <DashboardSkeleton />;
  if (report.isError) return <ErrorState error={report.error} />;
  const r = report.data!;
  const t = r.totals;

  const sections = r.bySection.map((s) => ({ name: s.name, completed: s.completed, incomplete: s.total - s.completed }));
  const people = r.byAssignee.map((a) => ({ name: a.assignee?.name ?? 'Unassigned', incomplete: a.incomplete, completed: a.completed }));
  const priorities = r.byPriority.map((p) => ({ name: PRIORITY_LABEL[p.priority] === 'None' ? 'No priority' : PRIORITY_LABEL[p.priority], incomplete: p.incomplete }));
  const trendTotals = r.trend.reduce((n, w) => ({ created: n.created + w.created, completed: n.completed + w.completed }), { created: 0, completed: 0 });

  return (
    <div className={`space-y-4 p-6 ${report.isPlaceholderData ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-base font-semibold">Dashboard</h2>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          Trend range
          <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {[4, 8, 12, 26, 52].map((w) => (
              <option key={w} value={w}>
                {w} weeks
              </option>
            ))}
          </select>
        </label>
        <ExportCsvLink projectId={projectId} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile label="Total tasks" value={t.total} hint="incl. subtasks" />
        <KpiTile label="Completed" value={t.completed} hint={`${t.percentComplete}% complete`} />
        <KpiTile label="Incomplete" value={t.incomplete} />
        <KpiTile label="Overdue" value={t.overdue} tone={t.overdue ? 'bad' : undefined} />
        <KpiTile label="Unassigned (open)" value={t.unassigned} hint="incomplete tasks without an assignee" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Tasks by section"
          summary={`${t.completed} of ${t.total} tasks complete across ${r.bySection.length} section(s).`}
          legend={[
            { label: 'Completed', color: SERIES.slot1 },
            { label: 'Incomplete', color: SERIES.slot2 },
          ]}
          table={{ columns: ['Section', 'Total', 'Completed', 'Incomplete', 'Overdue'], rows: r.bySection.map((s) => [s.name, s.total, s.completed, s.total - s.completed, s.overdue]) }}
          empty={t.total === 0}
        >
          <HBarStack
            data={sections}
            categoryKey="name"
            series={[
              { key: 'completed', label: 'Completed', color: SERIES.slot1 },
              { key: 'incomplete', label: 'Incomplete', color: SERIES.slot2 },
            ]}
          />
        </ChartCard>

        <ChartCard
          title="Tasks by assignee"
          summary={people[0] ? `${people[0].name} has the most open tasks (${people[0].incomplete}).` : undefined}
          legend={[
            { label: 'Incomplete', color: SERIES.slot2 },
            { label: 'Completed', color: SERIES.slot1 },
          ]}
          table={{ columns: ['Assignee', 'Incomplete', 'Completed', 'Overdue'], rows: r.byAssignee.map((a) => [a.assignee?.name ?? 'Unassigned', a.incomplete, a.completed, a.overdue]) }}
          empty={t.total === 0}
        >
          <HBarStack
            data={people}
            categoryKey="name"
            series={[
              { key: 'incomplete', label: 'Incomplete', color: SERIES.slot2 },
              { key: 'completed', label: 'Completed', color: SERIES.slot1 },
            ]}
          />
        </ChartCard>

        <ChartCard
          title="Incomplete tasks by priority"
          summary={`${r.byPriority.find((p) => p.priority === 'HIGH')?.incomplete ?? 0} high-priority task(s) still open.`}
          table={{ columns: ['Priority', 'Incomplete', 'Total'], rows: r.byPriority.map((p) => [PRIORITY_LABEL[p.priority], p.incomplete, p.total]) }}
          empty={t.total === 0}
        >
          <VBarSingle data={priorities} categoryKey="name" valueKey="incomplete" label="Incomplete" color={SERIES.slot1} />
        </ChartCard>

        <ChartCard
          title="Created vs completed"
          summary={`Last ${weeks} weeks: ${trendTotals.created} created, ${trendTotals.completed} completed, ${r.trend[r.trend.length - 1]?.open ?? 0} open now.`}
          legend={[
            { label: 'Created', color: SERIES.slot1 },
            { label: 'Completed', color: SERIES.slot2 },
            { label: 'Open', color: SERIES.slot3 },
          ]}
          table={{ columns: ['Week of', 'Created', 'Completed', 'Open at week end'], rows: r.trend.map((w) => [weekLabel(w.weekStart), w.created, w.completed, w.open]) }}
        >
          <TrendLines
            data={r.trend}
            xKey="weekStart"
            formatX={weekLabel}
            series={[
              { key: 'created', label: 'Created', color: SERIES.slot1 },
              { key: 'completed', label: 'Completed', color: SERIES.slot2 },
              { key: 'open', label: 'Open', color: SERIES.slot3 },
            ]}
          />
        </ChartCard>
      </div>

      <Upcoming report={r} />
    </div>
  );
}
