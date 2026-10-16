// Mock implementation of the Goals / OKR endpoints (SPEC §10).
import type { Goal, GoalDetail, GoalStatus, GoalUpdate, KeyResult, MetricType, ProgressSource } from '@/api/types';
import { uid, type GoalRow, type KeyResultRow, type MockDb, type UserRow } from './db';
import { HttpError, canSeeProject, forbidden, notFound, nowIso, summary, userById, type Handler } from './shared';

const PERIOD_RE = /^\d{4}(-(H[12]|Q[1-4]))?$/;
const STATUSES: GoalStatus[] = ['NO_STATUS', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ACHIEVED', 'PARTIAL', 'MISSED', 'DROPPED'];
const SOURCES: ProgressSource[] = ['KEY_RESULTS', 'SUB_GOALS', 'PROJECTS', 'MANUAL'];
const METRICS: MetricType[] = ['NUMBER', 'PERCENT', 'CURRENCY', 'BOOLEAN'];
const MAX_DEPTH = 6;

const fieldError = (field: string, message: string) => new HttpError(400, 'VALIDATION', message, [{ path: [field], message }]);
const round1 = (n: number) => Math.round(n * 10) / 10;

function tables(db: MockDb) {
  db.goals ??= [];
  db.keyResults ??= [];
  db.goalProjects ??= [];
  db.goalUpdates ??= [];
  return { goals: db.goals, krs: db.keyResults, links: db.goalProjects, updates: db.goalUpdates };
}

// ---------- progress (SPEC §10) ----------

/** Unrounded KR progress; roll-ups use raw values and round once at output (SPEC §10 clarifications). */
function krRaw(k: Pick<KeyResultRow, 'startValue' | 'targetValue' | 'currentValue'>) {
  const { startValue: s, targetValue: t, currentValue: c } = k;
  if (t === s) return c >= t ? 100 : 0;
  return Math.min(100, Math.max(0, ((c - s) / (t - s)) * 100));
}
export const krProgress = (k: Pick<KeyResultRow, 'startValue' | 'targetValue' | 'currentValue'>) => round1(krRaw(k));

function goalProgress(db: MockDb, g: GoalRow): number {
  return round1(goalRaw(db, g));
}

function goalRaw(db: MockDb, g: GoalRow, seen = new Set<string>()): number {
  if (seen.has(g.id)) return 0; // defensive: cycles are rejected on write
  seen.add(g.id);
  const t = tables(db);
  switch (g.progressSource) {
    case 'MANUAL':
      return g.manualProgress;
    case 'KEY_RESULTS': {
      const krs = t.krs.filter((k) => k.goalId === g.id);
      return krs.length ? krs.reduce((n, k) => n + krRaw(k), 0) / krs.length : 0;
    }
    case 'SUB_GOALS': {
      const kids = t.goals.filter((c) => c.parentId === g.id);
      const w = kids.reduce((n, c) => n + c.weight, 0);
      return w ? kids.reduce((n, c) => n + goalRaw(db, c, new Set(seen)) * c.weight, 0) / w : 0;
    }
    case 'PROJECTS': {
      const ids = new Set(t.links.filter((l) => l.goalId === g.id).map((l) => l.projectId));
      const tasks = db.tasks.filter((x) => x.projectId && ids.has(x.projectId));
      return tasks.length ? (tasks.filter((x) => x.completed).length / tasks.length) * 100 : 0;
    }
  }
}

// ---------- permissions ----------

const inTeam = (db: MockDb, teamId: string, userId: string) => db.teamMembers.some((m) => m.teamId === teamId && m.userId === userId);

function canEditGoal(db: MockDb, g: GoalRow, me: UserRow) {
  return me.role === 'ADMIN' || g.ownerId === me.id || (!!g.teamId && inTeam(db, g.teamId, me.id));
}
function assertCanCreateAt(db: MockDb, level: { isCompany: boolean; teamId: string | null }, me: UserRow) {
  if (level.isCompany && level.teamId) throw fieldError('isCompany', 'A goal is either a company goal or a team goal');
  if (me.role === 'ADMIN') return;
  if (level.isCompany) throw forbidden();
  if (level.teamId && !inTeam(db, level.teamId, me.id)) throw forbidden();
}

// ---------- serializers ----------

function serializeGoal(db: MockDb, g: GoalRow, me: UserRow): Goal {
  const t = tables(db);
  const team = g.teamId ? db.teams.find((x) => x.id === g.teamId) : null;
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    owner: summary(userById(db, g.ownerId)),
    team: team ? { id: team.id, name: team.name } : null,
    isCompany: g.isCompany,
    parentId: g.parentId,
    timePeriod: g.timePeriod,
    status: g.status,
    progressSource: g.progressSource,
    progress: goalProgress(db, g),
    weight: g.weight,
    keyResultCount: t.krs.filter((k) => k.goalId === g.id).length,
    childCount: t.goals.filter((c) => c.parentId === g.id).length,
    canEdit: canEditGoal(db, g, me),
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}
function serializeKr(db: MockDb, k: KeyResultRow): KeyResult {
  return {
    id: k.id,
    goalId: k.goalId,
    title: k.title,
    metricType: k.metricType,
    startValue: k.startValue,
    targetValue: k.targetValue,
    currentValue: k.currentValue,
    unit: k.unit,
    owner: k.ownerId ? summary(userById(db, k.ownerId)) : null,
    progress: krProgress(k),
    position: k.position,
    updatedAt: k.updatedAt,
  };
}
function serializeUpdate(db: MockDb, u: MockDb['goalUpdates'] extends (infer R)[] | undefined ? R : never): GoalUpdate {
  return { id: u.id, goalId: u.goalId, author: summary(userById(db, u.authorId)), status: u.status, progress: u.progress, body: u.body, createdAt: u.createdAt };
}
function serializeGoalDetail(db: MockDb, g: GoalRow, me: UserRow): GoalDetail {
  const t = tables(db);
  const parent = g.parentId ? t.goals.find((p) => p.id === g.parentId) : null;
  const linked = t.links.filter((l) => l.goalId === g.id).map((l) => db.projects.find((p) => p.id === l.projectId)).filter((p) => !!p);
  const visible = linked.filter((p) => canSeeProject(db, p, me));
  const latest = t.updates.filter((u) => u.goalId === g.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return {
    ...serializeGoal(db, g, me),
    parent: parent ? { id: parent.id, title: parent.title } : null,
    keyResults: t.krs.filter((k) => k.goalId === g.id).sort((a, b) => a.position - b.position).map((k) => serializeKr(db, k)),
    children: t.goals.filter((c) => c.parentId === g.id).map((c) => serializeGoal(db, c, me)),
    projects: visible.map((p) => {
      const tasks = db.tasks.filter((x) => x.projectId === p.id);
      return { project: { id: p.id, name: p.name, color: p.color }, total: tasks.length, completed: tasks.filter((x) => x.completed).length };
    }),
    hiddenProjectCount: linked.length - visible.length,
    latestUpdate: latest ? serializeUpdate(db, latest) : null,
  };
}

// ---------- validation ----------

function getGoal(db: MockDb, id: string) {
  const g = tables(db).goals.find((x) => x.id === id);
  if (!g) throw notFound();
  return g;
}
function getKr(db: MockDb, id: string) {
  const k = tables(db).krs.find((x) => x.id === id);
  if (!k) throw notFound();
  return k;
}
function depthAbove(db: MockDb, parentId: string | null) {
  let d = 0;
  let cur = parentId ? tables(db).goals.find((g) => g.id === parentId) : undefined;
  while (cur) {
    d += 1;
    cur = cur.parentId ? tables(db).goals.find((g) => g.id === cur!.parentId) : undefined;
  }
  return d;
}
function subtreeHeight(db: MockDb, id: string): number {
  const kids = tables(db).goals.filter((g) => g.parentId === id);
  return 1 + Math.max(0, ...kids.map((k) => subtreeHeight(db, k.id)));
}
function assertValidParent(db: MockDb, goalId: string | null, parentId: string | null) {
  if (!parentId) return;
  if (parentId === goalId) throw fieldError('parentId', 'A goal can’t be its own parent');
  const parent = tables(db).goals.find((g) => g.id === parentId);
  if (!parent) throw fieldError('parentId', 'Parent goal not found');
  // Walk up from the new parent: reaching this goal means a cycle.
  for (let cur: GoalRow | undefined = parent; cur; cur = cur.parentId ? tables(db).goals.find((g) => g.id === cur!.parentId) : undefined) {
    if (cur.id === goalId) throw fieldError('parentId', 'That would create a cycle');
  }
  const height = goalId ? subtreeHeight(db, goalId) : 1;
  if (depthAbove(db, parentId) + height > MAX_DEPTH) throw fieldError('parentId', `Goals can be nested at most ${MAX_DEPTH} levels deep`);
}
function validateKrFields(body: Record<string, unknown>, partial: boolean) {
  if (!partial || 'title' in body) {
    if (!String(body.title ?? '').trim()) throw fieldError('title', 'title is required');
  }
  if ('metricType' in body && !METRICS.includes(body.metricType as MetricType)) throw fieldError('metricType', 'bad metricType');
  for (const f of ['startValue', 'targetValue', 'currentValue', 'position']) {
    if (f in body && (typeof body[f] !== 'number' || !Number.isFinite(body[f]))) throw fieldError(f, `${f} must be a number`);
  }
}

// ---------- routes ----------

export const goalRoutes: [string, string, Handler][] = [
  [
    'GET',
    '/goals/time-periods',
    ({ db }) => {
      const now = new Date();
      const y = now.getFullYear();
      const current = [String(y), `${y}-H${now.getMonth() < 6 ? 1 : 2}`, `${y}-Q${Math.floor(now.getMonth() / 3) + 1}`];
      const rank: Record<string, number> = { '': 0, H1: 1, Q1: 2, Q2: 3, H2: 4, Q3: 5, Q4: 6 };
      const all = [...new Set([...tables(db).goals.map((g) => g.timePeriod), ...current])];
      all.sort((a, b) => {
        const [ya, pa = ''] = a.split('-');
        const [yb, pb = ''] = b.split('-');
        return Number(yb) - Number(ya) || rank[pa] - rank[pb];
      });
      return { data: all };
    },
  ],
  [
    'GET',
    '/goals',
    ({ db, me, query }) => {
      const period = query.get('timePeriod');
      const teamId = query.get('teamId');
      const ownerId = query.get('ownerId');
      const company = query.get('company') === 'true';
      const q = (query.get('q') ?? '').toLowerCase();
      return {
        data: tables(db)
          .goals.filter((g) => (!period || g.timePeriod === period) && (!teamId || g.teamId === teamId) && (!ownerId || g.ownerId === ownerId))
          .filter((g) => !company || g.isCompany)
          .filter((g) => !q || g.title.toLowerCase().includes(q))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
          .map((g) => serializeGoal(db, g, me!)),
      };
    },
  ],
  [
    'POST',
    '/goals',
    ({ db, me, body }) => {
      const title = String(body?.title ?? '').trim();
      if (!title) throw fieldError('title', 'title is required');
      if (!PERIOD_RE.test(String(body.timePeriod ?? ''))) throw fieldError('timePeriod', 'timePeriod must be YYYY, YYYY-H1|H2 or YYYY-Q1..Q4');
      const isCompany = !!body.isCompany;
      const teamId: string | null = body.teamId ?? null;
      if (teamId && !db.teams.some((t) => t.id === teamId)) throw notFound();
      assertCanCreateAt(db, { isCompany, teamId }, me!);
      const ownerId: string = body.ownerId ?? me!.id;
      const owner = db.users.find((u) => u.id === ownerId && u.isActive);
      if (!owner) throw fieldError('ownerId', 'Owner must be an active user');
      if (body.progressSource !== undefined && !SOURCES.includes(body.progressSource)) throw fieldError('progressSource', 'bad progressSource');
      assertValidParent(db, null, body.parentId ?? null);
      const g: GoalRow = {
        id: uid(db, 'goal'),
        title,
        description: body.description ?? null,
        ownerId,
        isCompany,
        teamId,
        parentId: body.parentId ?? null,
        timePeriod: body.timePeriod,
        status: 'NO_STATUS',
        progressSource: body.progressSource ?? 'KEY_RESULTS',
        manualProgress: 0,
        weight: Math.max(1, Math.round(body.weight ?? 1)),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      tables(db).goals.push(g);
      return { status: 201, body: serializeGoalDetail(db, g, me!) };
    },
  ],
  ['GET', '/goals/:id', ({ db, me, params }) => serializeGoalDetail(db, getGoal(db, params.id), me!)],
  [
    'PATCH',
    '/goals/:id',
    ({ db, me, params, body }) => {
      const g = getGoal(db, params.id);
      if (!canEditGoal(db, g, me!)) throw forbidden();
      const b = body ?? {};
      if ('title' in b && !String(b.title ?? '').trim()) throw fieldError('title', 'title is required');
      if ('timePeriod' in b && !PERIOD_RE.test(String(b.timePeriod))) throw fieldError('timePeriod', 'bad timePeriod');
      if ('status' in b && !STATUSES.includes(b.status)) throw fieldError('status', 'bad status');
      if ('progressSource' in b && !SOURCES.includes(b.progressSource)) throw fieldError('progressSource', 'bad progressSource');
      if ('manualProgress' in b && !(typeof b.manualProgress === 'number' && b.manualProgress >= 0 && b.manualProgress <= 100))
        throw fieldError('manualProgress', 'manualProgress must be 0–100');
      if ('weight' in b && !(Number.isInteger(b.weight) && b.weight >= 1)) throw fieldError('weight', 'weight must be an integer ≥ 1');
      if ('ownerId' in b && !db.users.some((u) => u.id === b.ownerId && u.isActive)) throw fieldError('ownerId', 'Owner must be an active user');
      if ('isCompany' in b || 'teamId' in b) {
        const level = { isCompany: 'isCompany' in b ? !!b.isCompany : g.isCompany, teamId: 'teamId' in b ? (b.teamId ?? null) : g.teamId };
        if (level.teamId && !db.teams.some((t) => t.id === level.teamId)) throw notFound();
        if (level.isCompany !== g.isCompany || level.teamId !== g.teamId) assertCanCreateAt(db, level, me!);
        g.isCompany = level.isCompany;
        g.teamId = level.teamId;
      }
      if ('parentId' in b) {
        assertValidParent(db, g.id, b.parentId ?? null);
        g.parentId = b.parentId ?? null;
      }
      for (const k of ['title', 'description', 'ownerId', 'timePeriod', 'status', 'progressSource', 'manualProgress', 'weight'] as const) {
        if (k in b) (g as Record<string, unknown>)[k] = k === 'title' ? String(b.title).trim() : b[k];
      }
      g.updatedAt = nowIso();
      return serializeGoalDetail(db, g, me!);
    },
  ],
  [
    'DELETE',
    '/goals/:id',
    ({ db, me, params }) => {
      const g = getGoal(db, params.id);
      if (!canEditGoal(db, g, me!)) throw forbidden();
      const t = tables(db);
      db.goals = t.goals.filter((x) => x.id !== g.id);
      db.keyResults = t.krs.filter((k) => k.goalId !== g.id);
      db.goalProjects = t.links.filter((l) => l.goalId !== g.id);
      db.goalUpdates = t.updates.filter((u) => u.goalId !== g.id);
      db.goals.forEach((c) => {
        if (c.parentId === g.id) c.parentId = null;
      });
      return { status: 204 };
    },
  ],
  [
    'POST',
    '/goals/:id/key-results',
    ({ db, me, params, body }) => {
      const g = getGoal(db, params.id);
      if (!canEditGoal(db, g, me!)) throw forbidden();
      const b = body ?? {};
      validateKrFields(b, false);
      if (!METRICS.includes(b.metricType)) throw fieldError('metricType', 'metricType is required');
      const boolean = b.metricType === 'BOOLEAN';
      if (boolean && b.currentValue !== undefined && b.currentValue !== 0 && b.currentValue !== 1)
        throw fieldError('currentValue', 'BOOLEAN key results take 0 or 1');
      if (!boolean && typeof b.targetValue !== 'number') throw fieldError('targetValue', 'targetValue is required');
      if (b.ownerId && !db.users.some((u) => u.id === b.ownerId && u.isActive)) throw fieldError('ownerId', 'Owner must be an active user');
      const startValue = boolean ? 0 : (b.startValue ?? 0);
      const krs = tables(db).krs.filter((k) => k.goalId === g.id);
      const k: KeyResultRow = {
        id: uid(db, 'kres'),
        goalId: g.id,
        title: String(b.title).trim(),
        metricType: b.metricType,
        startValue,
        targetValue: boolean ? 1 : b.targetValue,
        currentValue: boolean ? (b.currentValue ?? 0) : (b.currentValue ?? startValue),
        unit: b.unit ?? null,
        ownerId: b.ownerId ?? null,
        position: b.position ?? Math.max(0, ...krs.map((x) => x.position)) + 1000,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      tables(db).krs.push(k);
      return { status: 201, body: serializeKr(db, k) };
    },
  ],
  [
    'PATCH',
    '/key-results/:id',
    ({ db, me, params, body }) => {
      const k = getKr(db, params.id);
      const g = getGoal(db, k.goalId);
      const b = body ?? {};
      const onlyCurrent = Object.keys(b).every((key) => key === 'currentValue');
      const allowed = canEditGoal(db, g, me!) || (onlyCurrent && k.ownerId === me!.id);
      if (!allowed) throw forbidden();
      validateKrFields(b, true);
      if ((b.metricType ?? k.metricType) === 'BOOLEAN' && 'currentValue' in b && b.currentValue !== 0 && b.currentValue !== 1)
        throw fieldError('currentValue', 'BOOLEAN key results take 0 or 1');
      for (const f of ['title', 'metricType', 'startValue', 'targetValue', 'currentValue', 'unit', 'ownerId', 'position'] as const) {
        if (f in b) (k as Record<string, unknown>)[f] = f === 'title' ? String(b.title).trim() : b[f];
      }
      if (k.metricType === 'BOOLEAN') {
        k.startValue = 0;
        k.targetValue = 1;
        if (k.currentValue !== 1) k.currentValue = 0;
      }
      k.updatedAt = nowIso();
      return serializeKr(db, k);
    },
  ],
  [
    'DELETE',
    '/key-results/:id',
    ({ db, me, params }) => {
      const k = getKr(db, params.id);
      if (!canEditGoal(db, getGoal(db, k.goalId), me!)) throw forbidden();
      db.keyResults = tables(db).krs.filter((x) => x.id !== k.id);
      return { status: 204 };
    },
  ],
  [
    'POST',
    '/goals/:id/projects',
    ({ db, me, params, body }) => {
      const g = getGoal(db, params.id);
      if (!canEditGoal(db, g, me!)) throw forbidden();
      const p = db.projects.find((x) => x.id === body?.projectId);
      if (!p || !canSeeProject(db, p, me!)) throw notFound();
      const t = tables(db);
      if (!t.links.some((l) => l.goalId === g.id && l.projectId === p.id)) t.links.push({ goalId: g.id, projectId: p.id });
      return serializeGoalDetail(db, g, me!);
    },
  ],
  [
    'DELETE',
    '/goals/:id/projects/:projectId',
    ({ db, me, params }) => {
      const g = getGoal(db, params.id);
      if (!canEditGoal(db, g, me!)) throw forbidden();
      db.goalProjects = tables(db).links.filter((l) => !(l.goalId === g.id && l.projectId === params.projectId));
      return serializeGoalDetail(db, g, me!);
    },
  ],
  [
    'GET',
    '/goals/:id/updates',
    ({ db, params }) => {
      const g = getGoal(db, params.id);
      return {
        data: tables(db)
          .updates.filter((u) => u.goalId === g.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
          .map((u) => serializeUpdate(db, u)),
      };
    },
  ],
  [
    'POST',
    '/goals/:id/updates',
    ({ db, me, params, body }) => {
      const g = getGoal(db, params.id);
      const ownsKr = tables(db).krs.some((k) => k.goalId === g.id && k.ownerId === me!.id);
      if (!canEditGoal(db, g, me!) && !ownsKr) throw forbidden();
      if (!STATUSES.includes(body?.status)) throw fieldError('status', 'status is required');
      const u = {
        id: uid(db, 'gupd'),
        goalId: g.id,
        authorId: me!.id,
        status: body.status as GoalStatus,
        progress: goalProgress(db, g),
        body: typeof body.body === 'string' && body.body.trim() ? body.body.trim() : null,
        createdAt: nowIso(),
      };
      tables(db).updates.push(u);
      g.status = u.status;
      g.updatedAt = nowIso();
      return { status: 201, body: serializeUpdate(db, u) };
    },
  ],
];

/** Exposed for unit tests. */
export const __goalProgress = goalProgress;
