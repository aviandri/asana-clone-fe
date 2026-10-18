// Mock implementation of the Reporting endpoints (SPEC §11). Dates bucket in the browser's local
// time zone (the real BE uses APP_TIMEZONE); weeks start Monday.
import { addDays, addWeeks, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import type { Priority, ProjectReport, WorkloadReport } from '@/api/types';
import type { MockDb, ProjectRow, TaskRow } from './db';
import { HttpError, activeMembers, canSeeProject, canSeeTask, forbidGuest, serializeProject, serializeTask, summary, visibleProject, type Handler } from './shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITY_ORDER: Priority[] = ['HIGH', 'MEDIUM', 'LOW', 'NONE'];
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const today = () => ymd(new Date());
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const isOverdue = (t: TaskRow, now = today()) => !t.completed && !!t.dueDate && t.dueDate < now;
const fieldError = (field: string, message: string) => new HttpError(400, 'VALIDATION', message, [{ path: [field], message }]);

function counts(tasks: TaskRow[]) {
  const completed = tasks.filter((t) => t.completed).length;
  return { total: tasks.length, completed, incomplete: tasks.length - completed, overdue: tasks.filter((t) => isOverdue(t)).length };
}

/** Subtasks report under their parent's section (SPEC §11 clarifications). */
function effectiveSection(db: MockDb, t: TaskRow): string | null {
  if (!t.parentId) return t.sectionId;
  const parent = db.tasks.find((p) => p.id === t.parentId);
  return parent ? effectiveSection(db, parent) : null;
}

function projectReport(db: MockDb, p: ProjectRow, weeks: number): ProjectReport {
  const tasks = db.tasks.filter((t) => t.projectId === p.id);
  const sections = db.sections.filter((s) => s.projectId === p.id).sort((a, b) => a.position - b.position);
  const total = counts(tasks);

  const bySection = [
    ...sections.map((s) => ({ sectionId: s.id as string | null, name: s.name })),
    { sectionId: null, name: 'No section' },
  ]
    .map(({ sectionId, name }) => {
      const list = tasks.filter((t) => effectiveSection(db, t) === sectionId);
      const c = counts(list);
      return { sectionId, name, total: c.total, completed: c.completed, overdue: c.overdue };
    })
    .filter((s) => s.sectionId !== null || s.total > 0);

  const assignees = new Map<string | null, TaskRow[]>();
  for (const t of tasks) assignees.set(t.assigneeId, [...(assignees.get(t.assigneeId) ?? []), t]);
  const byAssignee = [...assignees.entries()]
    .map(([id, list]) => {
      const c = counts(list);
      const u = id ? db.users.find((x) => x.id === id) : null;
      return { assignee: u ? summary(u) : null, incomplete: c.incomplete, completed: c.completed, overdue: c.overdue };
    })
    .sort((a, b) => b.incomplete - a.incomplete || (a.assignee?.name ?? '~').localeCompare(b.assignee?.name ?? '~'));

  const byPriority = PRIORITY_ORDER.map((priority) => {
    const list = tasks.filter((t) => t.priority === priority);
    return { priority, total: list.length, incomplete: list.filter((t) => !t.completed).length };
  });

  const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const trend = Array.from({ length: weeks }, (_, i) => {
    const start = addWeeks(thisWeek, i - weeks + 1);
    const end = addWeeks(start, 1);
    const inWeek = (iso: string | null) => !!iso && new Date(iso) >= start && new Date(iso) < end;
    return {
      weekStart: ymd(start),
      created: tasks.filter((t) => inWeek(t.createdAt)).length,
      completed: tasks.filter((t) => inWeek(t.completedAt)).length,
      open: tasks.filter((t) => new Date(t.createdAt) < end && !(t.completedAt && new Date(t.completedAt) < end)).length,
    };
  });

  const now = today();
  const horizon = ymd(addDays(new Date(), 14));
  const upcoming = tasks
    .filter((t) => !t.completed && t.dueDate && t.dueDate >= now && t.dueDate <= horizon)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.position - b.position)
    .slice(0, 20)
    .map((t) => serializeTask(db, t));

  return {
    project: { id: p.id, name: p.name, color: p.color },
    totals: { ...total, unassigned: tasks.filter((t) => !t.completed && !t.assigneeId).length, percentComplete: pct(total.completed, total.total) },
    bySection,
    byAssignee,
    byPriority,
    trend,
    upcoming,
  };
}

// ---------- CSV (RFC 4180, BOM, CRLF, formula-injection guard) ----------

function csvCell(v: unknown) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function projectCsv(db: MockDb, p: ProjectRow) {
  const header = ['id', 'title', 'section', 'parent_task_id', 'assignee_name', 'assignee_email', 'priority', 'start_date', 'due_date', 'completed', 'completed_at', 'created_at'];
  const secPos = (id: string | null) => (id ? (db.sections.find((s) => s.id === id)?.position ?? Infinity) : -Infinity);
  const top = db.tasks.filter((t) => t.projectId === p.id && !t.parentId).sort((a, b) => secPos(a.sectionId) - secPos(b.sectionId) || a.position - b.position);
  const rows: TaskRow[] = [];
  for (const t of top) {
    rows.push(t);
    rows.push(...db.tasks.filter((s) => s.parentId === t.id).sort((a, b) => a.position - b.position));
  }
  const lines = rows.map((t) => {
    const u = t.assigneeId ? db.users.find((x) => x.id === t.assigneeId) : null;
    const section = db.sections.find((s) => s.id === effectiveSection(db, t))?.name ?? '';
    return [t.id, t.title, section, t.parentId ?? '', u?.name ?? '', u?.email ?? '', t.priority, t.startDate ?? '', t.dueDate ?? '', t.completed, t.completedAt ?? '', t.createdAt]
      .map(csvCell)
      .join(',');
  });
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  return { body: '\uFEFF' + [header.join(','), ...lines].join('\r\n') + '\r\n', filename: `${slug}-tasks.csv` };
}

export const reportRoutes: [string, string, Handler][] = [
  [
    'GET',
    '/projects/:id/report',
    ({ db, me, params, query }) => {
      const p = visibleProject(db, params.id, me!);
      const weeks = Number(query.get('weeks') ?? 12);
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) throw fieldError('weeks', 'weeks must be 1–52');
      return projectReport(db, p, weeks);
    },
  ],
  [
    'GET',
    '/projects/:id/tasks.csv',
    ({ db, me, params }) => {
      const p = visibleProject(db, params.id, me!);
      const { body, filename } = projectCsv(db, p);
      return { status: 200, raw: body, contentType: 'text/csv; charset=utf-8', filename };
    },
  ],
  [
    'GET',
    '/reports/overview',
    ({ db, me, ws, query }) => {
      const teamId = query.get('teamId');
      const wsId = ws().id;
      const projects = db.projects
        .filter((p) => p.workspaceId === wsId && !p.archived && canSeeProject(db, p, me!) && (!teamId || p.teamId === teamId))
        .sort((a, b) => a.name.localeCompare(b.name));
      const rows = projects.map((p) => {
        const tasks = db.tasks.filter((t) => t.projectId === p.id);
        const ids = new Set(tasks.map((t) => t.id));
        const stamps = [
          ...db.activities.filter((a) => ids.has(a.taskId)).map((a) => a.createdAt),
          ...db.comments.filter((c) => ids.has(c.taskId)).map((c) => c.createdAt),
        ].sort();
        const c = counts(tasks);
        return { ...c, project: serializeProject(db, p, me!), percentComplete: pct(c.completed, c.total), lastActivityAt: stamps[stamps.length - 1] ?? null };
      });
      const all = counts(db.tasks.filter((t) => t.projectId && projects.some((p) => p.id === t.projectId)));
      return { totals: { ...all, projects: projects.length }, projects: rows };
    },
  ],
  [
    'GET',
    '/reports/workload',
    ({ db, me, ws, role, query }): WorkloadReport => {
      forbidGuest(role());
      const wsId = ws().id;
      const teamId = query.get('teamId');
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
      const from = query.get('from') ?? ymd(monday);
      const to = query.get('to') ?? ymd(addDays(monday, 6));
      if (!DATE_RE.test(from)) throw fieldError('from', 'from must be YYYY-MM-DD');
      if (!DATE_RE.test(to)) throw fieldError('to', 'to must be YYYY-MM-DD');
      const span = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
      if (span < 1) throw fieldError('to', 'to must be on or after from');
      if (span > 92) throw fieldError('to', 'Range can be at most 92 days');
      if (teamId && !db.teams.some((t) => t.id === teamId && t.workspaceId === wsId)) throw new HttpError(404, 'NOT_FOUND', 'Not found');

      const teamProjects = teamId ? new Set(db.projects.filter((p) => p.teamId === teamId).map((p) => p.id)) : null;
      const members = new Set(activeMembers(db, wsId).map((m) => m.userId));
      const users = db.users.filter((u) => u.isActive && members.has(u.id) && (!teamId || db.teamMembers.some((m) => m.teamId === teamId && m.userId === u.id)));
      const tasks = db.tasks.filter(
        (t) => t.workspaceId === wsId && t.assigneeId && canSeeTask(db, t, me!) && (teamProjects ? !!t.projectId && teamProjects.has(t.projectId) : true),
      );
      const now = today();
      const inRange = (d: string | null) => !!d && d >= from && d <= to;
      const data = users
        .map((u) => {
          const mine = tasks.filter((t) => t.assigneeId === u.id);
          const open = mine.filter((t) => !t.completed);
          return {
            user: summary(u),
            open: open.length,
            overdue: open.filter((t) => isOverdue(t, now)).length,
            dueInRange: open.filter((t) => inRange(t.dueDate)).length,
            completedInRange: mine.filter((t) => t.completed && inRange(t.completedAt ? ymd(new Date(t.completedAt)) : null)).length,
          };
        })
        .sort((a, b) => b.open - a.open || a.user.name.localeCompare(b.user.name));
      return { from, to, data };
    },
  ],
];
