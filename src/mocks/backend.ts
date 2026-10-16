// A small in-process implementation of the API contract (docs/SPEC.md §6), used when the real
// backend isn't available (VITE_MOCK=true) and in tests. Not meant to be exhaustive — just
// faithful enough that the UI can be developed and tested against it.
import type {
  ErrorCode,
  Invite,
  Notification,
  Project,
  ProjectDetail,
  Story,
  Task,
  TaskDetail,
  Team,
  TeamDetail,
  User,
  UserSummary,
} from '@/api/types';
import { uid, type MockDb, type ProjectRow, type TaskRow, type UserRow } from './db';

class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Not found');
const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Forbidden');
const invalid = (msg: string) => new HttpError(400, 'VALIDATION', msg);

type Ctx = {
  db: MockDb;
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  me: UserRow | null;
};
type Result = { status: number; body?: unknown };
type Handler = (ctx: Ctx) => Result | unknown;

const nowIso = () => new Date().toISOString();

// ---------- serializers ----------

const summary = (u: UserRow): UserSummary => ({
  id: u.id,
  name: u.name,
  email: u.email,
  avatarColor: u.avatarColor,
});
const fullUser = (u: UserRow): User => ({ ...summary(u), role: u.role, isActive: u.isActive, createdAt: u.createdAt });
const userById = (db: MockDb, id: string) => {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw notFound();
  return u;
};

function serializeTeam(db: MockDb, t: MockDb['teams'][number]): Team {
  return {
    ...t,
    memberCount: db.teamMembers.filter((m) => m.teamId === t.id).length,
  };
}
function serializeTeamDetail(db: MockDb, t: MockDb['teams'][number]): TeamDetail {
  return {
    ...serializeTeam(db, t),
    members: db.teamMembers
      .filter((m) => m.teamId === t.id)
      .map((m) => summary(userById(db, m.userId))),
  };
}

function serializeProject(db: MockDb, p: ProjectRow, me: UserRow): Project {
  const membership = db.projectMembers.find((m) => m.projectId === p.id && m.userId === me.id);
  return {
    id: p.id,
    teamId: p.teamId,
    name: p.name,
    description: p.description,
    color: p.color,
    privacy: p.privacy,
    archived: p.archived,
    defaultView: p.defaultView,
    owner: summary(userById(db, p.ownerId)),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    myRole: membership?.role ?? null,
  };
}
function serializeProjectDetail(db: MockDb, p: ProjectRow, me: UserRow): ProjectDetail {
  const team = db.teams.find((t) => t.id === p.teamId)!;
  return {
    ...serializeProject(db, p, me),
    sections: db.sections
      .filter((s) => s.projectId === p.id)
      .sort((a, b) => a.position - b.position),
    members: db.projectMembers
      .filter((m) => m.projectId === p.id)
      .map((m) => ({ user: summary(userById(db, m.userId)), role: m.role })),
    team: { id: team.id, name: team.name },
  };
}

function serializeTask(db: MockDb, t: TaskRow): Task {
  const subs = db.tasks.filter((s) => s.parentId === t.id);
  const project = t.projectId ? db.projects.find((p) => p.id === t.projectId) : null;
  return {
    id: t.id,
    projectId: t.projectId,
    sectionId: t.sectionId,
    parentId: t.parentId,
    title: t.title,
    description: t.description,
    assignee: t.assigneeId ? summary(userById(db, t.assigneeId)) : null,
    creator: summary(userById(db, t.creatorId)),
    dueDate: t.dueDate,
    startDate: t.startDate,
    priority: t.priority,
    completed: t.completed,
    completedAt: t.completedAt,
    position: t.position,
    subtaskCount: subs.length,
    completedSubtaskCount: subs.filter((s) => s.completed).length,
    commentCount: db.comments.filter((c) => c.taskId === t.id).length,
    project: project ? { id: project.id, name: project.name, color: project.color } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
function serializeTaskDetail(db: MockDb, t: TaskRow): TaskDetail {
  const parent = t.parentId ? db.tasks.find((p) => p.id === t.parentId) : null;
  return {
    ...serializeTask(db, t),
    followers: db.followers
      .filter((f) => f.taskId === t.id)
      .map((f) => summary(userById(db, f.userId))),
    subtasks: db.tasks
      .filter((s) => s.parentId === t.id)
      .sort((a, b) => a.position - b.position)
      .map((s) => serializeTask(db, s)),
    parent: parent ? { id: parent.id, title: parent.title } : null,
  };
}

// ---------- permissions ----------

function canSeeProject(db: MockDb, p: ProjectRow, me: UserRow) {
  if (me.role === 'ADMIN' || p.privacy === 'PUBLIC') return true;
  if (db.projectMembers.some((m) => m.projectId === p.id && m.userId === me.id)) return true;
  if (p.privacy === 'TEAM') {
    return db.teamMembers.some((m) => m.teamId === p.teamId && m.userId === me.id);
  }
  return false;
}
function visibleProject(db: MockDb, id: string, me: UserRow) {
  const p = db.projects.find((x) => x.id === id);
  if (!p || !canSeeProject(db, p, me)) throw notFound();
  return p;
}
function assertCanEditProjectContent(db: MockDb, p: ProjectRow, me: UserRow) {
  if (me.role === 'ADMIN') return;
  const m = db.projectMembers.find((x) => x.projectId === p.id && x.userId === me.id);
  if (m?.role === 'COMMENTER') throw forbidden();
}
function assertProjectOwner(db: MockDb, p: ProjectRow, me: UserRow) {
  if (me.role === 'ADMIN') return;
  const m = db.projectMembers.find((x) => x.projectId === p.id && x.userId === me.id);
  if (m?.role !== 'OWNER') throw forbidden();
}
function canSeeTask(db: MockDb, t: TaskRow, me: UserRow): boolean {
  if (t.projectId) {
    const p = db.projects.find((x) => x.id === t.projectId);
    return !!p && canSeeProject(db, p, me);
  }
  if (me.role === 'ADMIN') return true;
  return (
    t.creatorId === me.id ||
    t.assigneeId === me.id ||
    db.followers.some((f) => f.taskId === t.id && f.userId === me.id)
  );
}
function visibleTask(db: MockDb, id: string, me: UserRow) {
  const t = db.tasks.find((x) => x.id === id);
  if (!t || !canSeeTask(db, t, me)) throw notFound();
  return t;
}
function assertCanEditTask(db: MockDb, t: TaskRow, me: UserRow) {
  if (!t.projectId) return;
  assertCanEditProjectContent(db, db.projects.find((p) => p.id === t.projectId)!, me);
}
/** 400 VALIDATION when `user` couldn't see the task's project (assigning / adding followers). */
function assertCanSeeTaskProject(db: MockDb, t: TaskRow, user: UserRow, field: string) {
  if (!t.projectId) return;
  const p = db.projects.find((x) => x.id === t.projectId)!;
  if (!canSeeProject(db, p, user)) {
    const message = `${user.name} doesn’t have access to this project`;
    // Same shape as the BE (zod issues): [{ path: [field], message }]
    throw new HttpError(400, 'VALIDATION', message, [{ path: [field], message }]);
  }
}

function assertNotLastOwner(db: MockDb, projectId: string) {
  const owners = db.projectMembers.filter((m) => m.projectId === projectId && m.role === 'OWNER');
  if (owners.length <= 1) throw new HttpError(409, 'CONFLICT', 'A project must keep at least one owner');
}
const requireAdmin = (me: UserRow) => {
  if (me.role !== 'ADMIN') throw forbidden();
};

// ---------- side effects ----------

function follow(db: MockDb, taskId: string, userId: string) {
  if (!db.followers.some((f) => f.taskId === taskId && f.userId === userId)) {
    db.followers.push({ taskId, userId });
  }
}
function activity(db: MockDb, taskId: string, actorId: string, type: string, data: unknown = {}) {
  db.activities.push({ id: uid(db, 'actv'), taskId, actorId, type, data, createdAt: nowIso() });
}
function notify(
  db: MockDb,
  userId: string,
  actorId: string,
  taskId: string | null,
  type: Notification['type'],
) {
  if (userId === actorId) return;
  db.notifications.push({
    id: uid(db, 'ntfy'),
    userId,
    actorId,
    taskId,
    type,
    read: false,
    createdAt: nowIso(),
  });
}
function notifyFollowers(db: MockDb, t: TaskRow, actorId: string, type: Notification['type']) {
  db.followers
    .filter((f) => f.taskId === t.id)
    .forEach((f) => notify(db, f.userId, actorId, t.id, type));
}
const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-zA-Z-]+)\)/g;
function mentionedIds(body: string) {
  return [...body.matchAll(MENTION_RE)].map((m) => m[2]);
}

const LOGIN_ATTEMPT_LIMIT = 5;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];

function applyTaskPatch(db: MockDb, t: TaskRow, body: Record<string, unknown>, me: UserRow) {
  const prev = { ...t };
  if ('title' in body) {
    const title = String(body.title ?? '').trim();
    if (!title) throw invalid('title is required');
    t.title = title;
  }
  if ('description' in body) t.description = (body.description as string | null) ?? null;
  for (const k of ['dueDate', 'startDate'] as const) {
    if (k in body) {
      const v = body[k] as string | null;
      if (v !== null && !DATE_RE.test(String(v))) throw invalid(`${k} must be YYYY-MM-DD`);
      t[k] = v;
    }
  }
  if ('priority' in body) {
    if (!PRIORITIES.includes(String(body.priority))) throw invalid('bad priority');
    t.priority = body.priority as TaskRow['priority'];
  }
  if ('assigneeId' in body) {
    const a = body.assigneeId as string | null;
    if (a) assertCanSeeTaskProject(db, t, userById(db, a), 'assigneeId');
    t.assigneeId = a;
  }
  if ('projectId' in body) {
    const pid = body.projectId as string | null;
    if (pid) visibleProject(db, pid, me);
    t.projectId = pid;
    if (pid !== prev.projectId && !('sectionId' in body)) t.sectionId = null;
  }
  if ('sectionId' in body) {
    const sid = body.sectionId as string | null;
    if (sid) {
      const s = db.sections.find((x) => x.id === sid);
      if (!s || s.projectId !== t.projectId) throw invalid('section does not belong to project');
    }
    t.sectionId = sid;
  }
  if ('position' in body) t.position = Number(body.position);
  if ('completed' in body) {
    t.completed = !!body.completed;
    t.completedAt = t.completed ? (prev.completedAt ?? nowIso()) : null;
  }
  t.updatedAt = nowIso();

  // activity + notifications
  if (t.title !== prev.title) activity(db, t.id, me.id, 'RENAMED', { from: prev.title, to: t.title });
  if (t.description !== prev.description) activity(db, t.id, me.id, 'DESCRIPTION_CHANGED');
  if (t.dueDate !== prev.dueDate)
    activity(db, t.id, me.id, 'DUE_DATE_CHANGED', { from: prev.dueDate, to: t.dueDate });
  if (t.priority !== prev.priority)
    activity(db, t.id, me.id, 'PRIORITY_CHANGED', { from: prev.priority, to: t.priority });
  if (t.sectionId !== prev.sectionId)
    activity(db, t.id, me.id, 'MOVED_SECTION', {
      fromSectionId: prev.sectionId,
      toSectionId: t.sectionId,
    });
  if (t.assigneeId !== prev.assigneeId) {
    if (t.assigneeId) {
      activity(db, t.id, me.id, 'ASSIGNED', { assigneeId: t.assigneeId });
      follow(db, t.id, t.assigneeId);
      notify(db, t.assigneeId, me.id, t.id, 'ASSIGNED');
    } else {
      activity(db, t.id, me.id, 'UNASSIGNED');
    }
  }
  if (t.completed !== prev.completed) {
    activity(db, t.id, me.id, t.completed ? 'COMPLETED' : 'REOPENED');
    if (t.completed) notifyFollowers(db, t, me.id, 'COMPLETED');
  }
}

function deleteTaskTree(db: MockDb, id: string) {
  const ids = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of db.tasks) {
      if (t.parentId && ids.has(t.parentId) && !ids.has(t.id)) {
        ids.add(t.id);
        grew = true;
      }
    }
  }
  db.tasks = db.tasks.filter((t) => !ids.has(t.id));
  db.followers = db.followers.filter((f) => !ids.has(f.taskId));
  db.comments = db.comments.filter((c) => !ids.has(c.taskId));
  db.activities = db.activities.filter((a) => !ids.has(a.taskId));
  db.notifications = db.notifications.filter((n) => !n.taskId || !ids.has(n.taskId));
}

function sortTasksForProject(db: MockDb, tasks: TaskRow[]) {
  const secPos = (sid: string | null) =>
    sid ? (db.sections.find((s) => s.id === sid)?.position ?? Infinity) : -Infinity;
  return [...tasks].sort((a, b) => secPos(a.sectionId) - secPos(b.sectionId) || a.position - b.position);
}

function serializeStory(db: MockDb, s: { kind: 'comment' | 'activity'; row: unknown }): Story {
  if (s.kind === 'comment') {
    const c = s.row as MockDb['comments'][number];
    return {
      kind: 'comment',
      id: c.id,
      author: summary(userById(db, c.authorId)),
      body: c.body,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
    };
  }
  const a = s.row as MockDb['activities'][number];
  return {
    kind: 'activity',
    id: a.id,
    actor: summary(userById(db, a.actorId)),
    type: a.type,
    data: a.data,
    createdAt: a.createdAt,
  };
}

function serializeInvite(db: MockDb, i: MockDb['invites'][number]): Invite {
  const inviter = db.users.find((u) => u.id === i.invitedById);
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    token: i.token,
    inviteUrl: `${location.origin}/invite/${i.token}`,
    expiresAt: i.expiresAt,
    createdAt: i.createdAt,
    ...(inviter && { invitedBy: summary(inviter) }),
  };
}

/** 404 for unknown tokens; 410 GONE for used or expired ones. */
function usableInvite(db: MockDb, token: string) {
  const inv = db.invites.find((i) => i.token === token);
  if (!inv) throw notFound();
  if (inv.acceptedAt) throw new HttpError(410, 'GONE', 'Invite has already been used');
  if (new Date(inv.expiresAt) < new Date()) throw new HttpError(410, 'GONE', 'Invite has expired');
  return inv;
}

const bool = (v: string | null) => (v === null ? undefined : v === 'true');

// ---------- routes ----------

const routes: [string, string, Handler, { public?: boolean }?][] = [
  ['GET', '/health', () => ({ ok: true }), { public: true }],

  // auth
  [
    'POST',
    '/auth/login',
    ({ db, body }) => {
      const email = String(body?.email ?? '').toLowerCase();
      const failures = (db.loginFailures ??= {});
      if ((failures[email] ?? 0) >= LOGIN_ATTEMPT_LIMIT)
        throw new HttpError(429, 'RATE_LIMITED', 'Too many login attempts. Try again later.');
      const u = db.users.find((x) => x.email === email);
      if (!u || u.password !== body?.password || !u.isActive) {
        failures[email] = (failures[email] ?? 0) + 1;
        throw new HttpError(401, 'UNAUTHORIZED', 'Invalid email or password');
      }
      delete failures[email];
      db.sessionUserId = u.id;
      return fullUser(u);
    },
    { public: true },
  ],
  [
    'POST',
    '/auth/logout',
    ({ db }) => {
      db.sessionUserId = null;
      return { status: 204 };
    },
    { public: true },
  ],
  ['GET', '/auth/me', ({ me }) => fullUser(me!)],
  [
    'GET',
    '/auth/invites/:token',
    ({ db, params }) => {
      const inv = usableInvite(db, params.token);
      return { email: inv.email, role: inv.role };
    },
    { public: true },
  ],
  [
    'POST',
    '/auth/accept-invite',
    ({ db, body }) => {
      const inv = usableInvite(db, String(body?.token ?? ''));
      const name = String(body?.name ?? '').trim();
      const password = String(body?.password ?? '');
      if (!name) throw invalid('name is required');
      if (password.length < 8) throw invalid('Password must be at least 8 characters');
      if (db.users.some((u) => u.email === inv.email)) throw new HttpError(409, 'CONFLICT', 'User exists');
      const u: UserRow = {
        id: uid(db, 'user'),
        email: inv.email,
        name,
        password,
        role: inv.role,
        isActive: true,
        avatarColor: '#9ee7e3',
        createdAt: nowIso(),
      };
      db.users.push(u);
      inv.acceptedAt = nowIso();
      db.sessionUserId = u.id;
      return fullUser(u);
    },
    { public: true },
  ],

  // users
  [
    'GET',
    '/users',
    ({ db, query }) => {
      const q = (query.get('q') ?? '').toLowerCase();
      return {
        data: db.users
          .filter((u) => u.isActive)
          .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.includes(q))
          .map(summary),
      };
    },
  ],
  ['GET', '/users/:id', ({ db, params }) => fullUser(userById(db, params.id))],
  [
    'PATCH',
    '/users/me',
    ({ me, body }) => {
      if (body.newPassword) {
        if (body.currentPassword !== me!.password) throw invalid('Current password is incorrect');
        me!.password = body.newPassword;
      }
      if (body.name !== undefined) me!.name = String(body.name);
      if (body.avatarColor !== undefined) me!.avatarColor = String(body.avatarColor);
      return fullUser(me!);
    },
  ],

  // admin
  [
    'GET',
    '/admin/users',
    ({ db, me }) => {
      requireAdmin(me!);
      return { data: db.users.map(fullUser) };
    },
  ],
  [
    'PATCH',
    '/admin/users/:id',
    ({ db, me, params, body }) => {
      requireAdmin(me!);
      const u = userById(db, params.id);
      if (body.role !== undefined) u.role = body.role;
      if (body.isActive !== undefined) u.isActive = !!body.isActive;
      return fullUser(u);
    },
  ],
  [
    'GET',
    '/admin/invites',
    ({ db, me }) => {
      requireAdmin(me!);
      return {
        data: db.invites
          .filter((i) => !i.acceptedAt)
          .map((i) => serializeInvite(db, i)),
      };
    },
  ],
  [
    'POST',
    '/admin/invites',
    ({ db, me, body }) => {
      requireAdmin(me!);
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw invalid('Invalid email');
      if (db.users.some((u) => u.email === email)) throw new HttpError(409, 'CONFLICT', 'User already exists');
      const token = uid(db, 'tokn').replace(/-/g, '');
      const inv = {
        id: uid(db, 'invt'),
        email,
        role: body.role ?? 'MEMBER',
        token,
        invitedById: me!.id,
        expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
        acceptedAt: null,
        createdAt: nowIso(),
      };
      db.invites.push(inv);
      return { status: 201, body: serializeInvite(db, inv) };
    },
  ],
  [
    'DELETE',
    '/admin/invites/:id',
    ({ db, me, params }) => {
      requireAdmin(me!);
      db.invites = db.invites.filter((i) => i.id !== params.id);
      return { status: 204 };
    },
  ],

  // teams
  [
    'GET',
    '/teams',
    ({ db, me, query }) => {
      const mine = query.get('mine') === 'true';
      return {
        data: db.teams
          .filter((t) => !mine || db.teamMembers.some((m) => m.teamId === t.id && m.userId === me!.id))
          .map((t) => serializeTeam(db, t)),
      };
    },
  ],
  [
    'POST',
    '/teams',
    ({ db, me, body }) => {
      const name = String(body?.name ?? '').trim();
      if (!name) throw invalid('name is required');
      const t = { id: uid(db, 'team'), name, description: body.description ?? null, createdAt: nowIso() };
      db.teams.push(t);
      db.teamMembers.push({ teamId: t.id, userId: me!.id });
      return { status: 201, body: serializeTeamDetail(db, t) };
    },
  ],
  [
    'GET',
    '/teams/:id',
    ({ db, params }) => {
      const t = db.teams.find((x) => x.id === params.id);
      if (!t) throw notFound();
      return serializeTeamDetail(db, t);
    },
  ],
  [
    'PATCH',
    '/teams/:id',
    ({ db, me, params, body }) => {
      const t = db.teams.find((x) => x.id === params.id);
      if (!t) throw notFound();
      const isMember = db.teamMembers.some((m) => m.teamId === t.id && m.userId === me!.id);
      if (!isMember && me!.role !== 'ADMIN') throw forbidden();
      if (body.name !== undefined) t.name = String(body.name);
      if (body.description !== undefined) t.description = body.description;
      return serializeTeamDetail(db, t);
    },
  ],
  [
    'DELETE',
    '/teams/:id',
    ({ db, me, params }) => {
      requireAdmin(me!);
      if (db.projects.some((p) => p.teamId === params.id))
        throw new HttpError(409, 'CONFLICT', 'Team still has projects');
      db.teams = db.teams.filter((t) => t.id !== params.id);
      db.teamMembers = db.teamMembers.filter((m) => m.teamId !== params.id);
      return { status: 204 };
    },
  ],
  [
    'POST',
    '/teams/:id/members',
    ({ db, params, body }) => {
      const t = db.teams.find((x) => x.id === params.id);
      if (!t) throw notFound();
      userById(db, body.userId);
      if (!db.teamMembers.some((m) => m.teamId === t.id && m.userId === body.userId))
        db.teamMembers.push({ teamId: t.id, userId: body.userId });
      return serializeTeamDetail(db, t);
    },
  ],
  [
    'DELETE',
    '/teams/:id/members/:userId',
    ({ db, params }) => {
      const t = db.teams.find((x) => x.id === params.id);
      if (!t) throw notFound();
      db.teamMembers = db.teamMembers.filter((m) => !(m.teamId === t.id && m.userId === params.userId));
      return serializeTeamDetail(db, t);
    },
  ],

  // projects
  [
    'GET',
    '/projects',
    ({ db, me, query }) => {
      const teamId = query.get('teamId');
      const archived = bool(query.get('archived'));
      const q = (query.get('q') ?? '').toLowerCase();
      return {
        data: db.projects
          .filter((p) => canSeeProject(db, p, me!))
          .filter((p) => !teamId || p.teamId === teamId)
          .filter((p) => archived === undefined || p.archived === archived)
          .filter((p) => !q || p.name.toLowerCase().includes(q))
          .map((p) => serializeProject(db, p, me!)),
      };
    },
  ],
  [
    'POST',
    '/projects',
    ({ db, me, body }) => {
      const name = String(body?.name ?? '').trim();
      if (!name) throw invalid('name is required');
      if (!db.teams.some((t) => t.id === body.teamId)) throw invalid('teamId is invalid');
      const inTeam = db.teamMembers.some((m) => m.teamId === body.teamId && m.userId === me!.id);
      if (!inTeam && me!.role !== 'ADMIN') throw forbidden();
      const p: ProjectRow = {
        id: uid(db, 'proj'),
        teamId: body.teamId,
        ownerId: me!.id,
        name,
        description: body.description ?? null,
        color: body.color ?? '#4573d2',
        privacy: body.privacy ?? 'TEAM',
        archived: false,
        defaultView: body.defaultView ?? 'LIST',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.projects.push(p);
      db.projectMembers.push({ projectId: p.id, userId: me!.id, role: 'OWNER' });
      ['To do', 'In progress', 'Done'].forEach((n, i) =>
        db.sections.push({ id: uid(db, 'sect'), projectId: p.id, name: n, position: (i + 1) * 1000 }),
      );
      return { status: 201, body: serializeProjectDetail(db, p, me!) };
    },
  ],
  ['GET', '/projects/:id', ({ db, me, params }) => serializeProjectDetail(db, visibleProject(db, params.id, me!), me!)],
  [
    'PATCH',
    '/projects/:id',
    ({ db, me, params, body }) => {
      const p = visibleProject(db, params.id, me!);
      assertProjectOwner(db, p, me!);
      for (const k of ['name', 'description', 'color', 'privacy', 'archived', 'defaultView'] as const) {
        if (k in body) (p as Record<string, unknown>)[k] = body[k];
      }
      p.updatedAt = nowIso();
      return serializeProjectDetail(db, p, me!);
    },
  ],
  [
    'DELETE',
    '/projects/:id',
    ({ db, me, params }) => {
      const p = visibleProject(db, params.id, me!);
      assertProjectOwner(db, p, me!);
      db.tasks.filter((t) => t.projectId === p.id && !t.parentId).forEach((t) => deleteTaskTree(db, t.id));
      db.sections = db.sections.filter((s) => s.projectId !== p.id);
      db.projectMembers = db.projectMembers.filter((m) => m.projectId !== p.id);
      db.projects = db.projects.filter((x) => x.id !== p.id);
      return { status: 204 };
    },
  ],
  [
    'POST',
    '/projects/:id/members',
    ({ db, me, params, body }) => {
      const p = visibleProject(db, params.id, me!);
      assertProjectOwner(db, p, me!);
      userById(db, body.userId);
      const existing = db.projectMembers.find((m) => m.projectId === p.id && m.userId === body.userId);
      if (existing?.role === 'OWNER' && body.role !== 'OWNER') assertNotLastOwner(db, p.id);
      if (existing) existing.role = body.role;
      else db.projectMembers.push({ projectId: p.id, userId: body.userId, role: body.role ?? 'EDITOR' });
      return serializeProjectDetail(db, p, me!);
    },
  ],
  [
    'PATCH',
    '/projects/:id/members/:userId',
    ({ db, me, params, body }) => {
      const p = visibleProject(db, params.id, me!);
      assertProjectOwner(db, p, me!);
      const m = db.projectMembers.find((x) => x.projectId === p.id && x.userId === params.userId);
      if (!m) throw notFound();
      if (m.role === 'OWNER' && body.role !== 'OWNER') assertNotLastOwner(db, p.id);
      m.role = body.role;
      return serializeProjectDetail(db, p, me!);
    },
  ],
  [
    'DELETE',
    '/projects/:id/members/:userId',
    ({ db, me, params }) => {
      const p = visibleProject(db, params.id, me!);
      assertProjectOwner(db, p, me!);
      const target = db.projectMembers.find((m) => m.projectId === p.id && m.userId === params.userId);
      if (target?.role === 'OWNER') assertNotLastOwner(db, p.id);
      db.projectMembers = db.projectMembers.filter(
        (m) => !(m.projectId === p.id && m.userId === params.userId),
      );
      return serializeProjectDetail(db, p, me!);
    },
  ],
  [
    'POST',
    '/projects/:id/sections',
    ({ db, me, params, body }) => {
      const p = visibleProject(db, params.id, me!);
      assertCanEditProjectContent(db, p, me!);
      const name = String(body?.name ?? '').trim();
      if (!name) throw invalid('name is required');
      const max = Math.max(0, ...db.sections.filter((s) => s.projectId === p.id).map((s) => s.position));
      const s = { id: uid(db, 'sect'), projectId: p.id, name, position: body.position ?? max + 1000 };
      db.sections.push(s);
      return { status: 201, body: s };
    },
  ],
  [
    'PATCH',
    '/sections/:id',
    ({ db, me, params, body }) => {
      const s = db.sections.find((x) => x.id === params.id);
      if (!s) throw notFound();
      const p = visibleProject(db, s.projectId, me!);
      assertCanEditProjectContent(db, p, me!);
      if (body.name !== undefined) s.name = String(body.name);
      if (body.position !== undefined) s.position = Number(body.position);
      return s;
    },
  ],
  [
    'DELETE',
    '/sections/:id',
    ({ db, me, params }) => {
      const s = db.sections.find((x) => x.id === params.id);
      if (!s) throw notFound();
      const p = visibleProject(db, s.projectId, me!);
      assertCanEditProjectContent(db, p, me!);
      db.tasks.forEach((t) => {
        if (t.sectionId === s.id) t.sectionId = null;
      });
      db.sections = db.sections.filter((x) => x.id !== s.id);
      return { status: 204 };
    },
  ],

  // tasks
  [
    'GET',
    '/projects/:id/tasks',
    ({ db, me, params, query }) => {
      const p = visibleProject(db, params.id, me!);
      const completed = bool(query.get('completed'));
      const assigneeId = query.get('assigneeId');
      const rows = db.tasks.filter(
        (t) =>
          t.projectId === p.id &&
          !t.parentId &&
          (completed === undefined || t.completed === completed) &&
          (!assigneeId || t.assigneeId === assigneeId),
      );
      return { data: sortTasksForProject(db, rows).map((t) => serializeTask(db, t)) };
    },
  ],
  [
    'GET',
    '/me/tasks',
    ({ db, me, query }) => {
      const completed = bool(query.get('completed'));
      return {
        data: db.tasks
          .filter((t) => t.assigneeId === me!.id && (completed === undefined || t.completed === completed))
          .filter((t) => canSeeTask(db, t, me!))
          .sort((a, b) => a.position - b.position)
          .map((t) => serializeTask(db, t)),
      };
    },
  ],
  [
    'POST',
    '/tasks',
    ({ db, me, body }) => {
      const title = String(body?.title ?? '').trim();
      if (!title) throw invalid('title is required');
      let projectId: string | null = body.projectId ?? null;
      if (body.parentId) {
        const parent = visibleTask(db, body.parentId, me!);
        projectId = parent.projectId;
      }
      if (projectId) assertCanEditProjectContent(db, visibleProject(db, projectId, me!), me!);
      const siblings = db.tasks.filter((t) =>
        body.parentId ? t.parentId === body.parentId : t.projectId === projectId && t.sectionId === (body.sectionId ?? null),
      );
      const t: TaskRow = {
        id: uid(db, 'task'),
        projectId,
        sectionId: body.parentId ? null : (body.sectionId ?? null),
        parentId: body.parentId ?? null,
        title,
        description: body.description ?? null,
        assigneeId: null,
        creatorId: me!.id,
        dueDate: null,
        startDate: null,
        priority: 'NONE',
        completed: false,
        completedAt: null,
        position: body.position ?? Math.max(0, ...siblings.map((s) => s.position)) + 1000,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.tasks.push(t);
      follow(db, t.id, me!.id);
      activity(db, t.id, me!.id, 'CREATED');
      const { title: _t, description: _d, projectId: _p, sectionId: _s, parentId: _pa, position: _po, ...rest } = body;
      applyTaskPatch(db, t, rest, me!);
      return { status: 201, body: serializeTaskDetail(db, t) };
    },
  ],
  ['GET', '/tasks/:id', ({ db, me, params }) => serializeTaskDetail(db, visibleTask(db, params.id, me!))],
  [
    'PATCH',
    '/tasks/:id',
    ({ db, me, params, body }) => {
      const t = visibleTask(db, params.id, me!);
      assertCanEditTask(db, t, me!);
      applyTaskPatch(db, t, body ?? {}, me!);
      return serializeTaskDetail(db, t);
    },
  ],
  [
    'DELETE',
    '/tasks/:id',
    ({ db, me, params }) => {
      const t = visibleTask(db, params.id, me!);
      assertCanEditTask(db, t, me!);
      deleteTaskTree(db, t.id);
      return { status: 204 };
    },
  ],
  [
    'POST',
    '/tasks/:id/followers',
    ({ db, me, params, body }) => {
      const t = visibleTask(db, params.id, me!);
      assertCanSeeTaskProject(db, t, userById(db, body.userId), 'userId');
      follow(db, t.id, body.userId);
      return serializeTaskDetail(db, t);
    },
  ],
  [
    'DELETE',
    '/tasks/:id/followers/:userId',
    ({ db, me, params }) => {
      const t = visibleTask(db, params.id, me!);
      db.followers = db.followers.filter((f) => !(f.taskId === t.id && f.userId === params.userId));
      return serializeTaskDetail(db, t);
    },
  ],

  // stories
  [
    'GET',
    '/tasks/:id/stories',
    ({ db, me, params }) => {
      const t = visibleTask(db, params.id, me!);
      const items = [
        ...db.comments.filter((c) => c.taskId === t.id).map((row) => ({ kind: 'comment' as const, row, at: row.createdAt })),
        ...db.activities.filter((a) => a.taskId === t.id).map((row) => ({ kind: 'activity' as const, row, at: row.createdAt })),
      ].sort((a, b) => a.at.localeCompare(b.at));
      return { data: items.map((s) => serializeStory(db, s)) };
    },
  ],
  [
    'POST',
    '/tasks/:id/comments',
    ({ db, me, params, body }) => {
      const t = visibleTask(db, params.id, me!);
      const text = String(body?.body ?? '').trim();
      if (!text) throw invalid('body is required');
      const c = { id: uid(db, 'cmnt'), taskId: t.id, authorId: me!.id, body: text, createdAt: nowIso(), editedAt: null };
      db.comments.push(c);
      follow(db, t.id, me!.id);
      const mentioned = new Set(mentionedIds(text).filter((id) => db.users.some((u) => u.id === id)));
      mentioned.forEach((id) => notify(db, id, me!.id, t.id, 'MENTIONED'));
      db.followers
        .filter((f) => f.taskId === t.id && !mentioned.has(f.userId))
        .forEach((f) => notify(db, f.userId, me!.id, t.id, 'COMMENTED'));
      return { status: 201, body: serializeStory(db, { kind: 'comment', row: c }) };
    },
  ],
  [
    'PATCH',
    '/comments/:id',
    ({ db, me, params, body }) => {
      const c = db.comments.find((x) => x.id === params.id);
      if (!c) throw notFound();
      if (c.authorId !== me!.id) throw forbidden();
      c.body = String(body?.body ?? '');
      c.editedAt = nowIso();
      return serializeStory(db, { kind: 'comment', row: c });
    },
  ],
  [
    'DELETE',
    '/comments/:id',
    ({ db, me, params }) => {
      const c = db.comments.find((x) => x.id === params.id);
      if (!c) throw notFound();
      if (c.authorId !== me!.id && me!.role !== 'ADMIN') throw forbidden();
      db.comments = db.comments.filter((x) => x.id !== c.id);
      return { status: 204 };
    },
  ],

  // notifications
  [
    'GET',
    '/notifications',
    ({ db, me, query }) => {
      const unread = query.get('unread') === 'true';
      const limit = Number(query.get('limit') ?? 50);
      const mine = db.notifications.filter((n) => n.userId === me!.id);
      const data: Notification[] = mine
        .filter((n) => !unread || !n.read)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map((n) => {
          const task = n.taskId ? db.tasks.find((t) => t.id === n.taskId) : null;
          return {
            id: n.id,
            type: n.type,
            read: n.read,
            createdAt: n.createdAt,
            actor: summary(userById(db, n.actorId)),
            task: task ? { id: task.id, title: task.title, projectId: task.projectId } : null,
          };
        });
      return { data, unreadCount: mine.filter((n) => !n.read).length };
    },
  ],
  [
    'POST',
    '/notifications/read-all',
    ({ db, me }) => {
      db.notifications.forEach((n) => {
        if (n.userId === me!.id) n.read = true;
      });
      return { status: 204 };
    },
  ],
  [
    'POST',
    '/notifications/:id/read',
    ({ db, me, params }) => {
      const n = db.notifications.find((x) => x.id === params.id && x.userId === me!.id);
      if (!n) throw notFound();
      n.read = true;
      return { status: 204 };
    },
  ],

  // search
  [
    'GET',
    '/search',
    ({ db, me, query }) => {
      const q = (query.get('q') ?? '').trim().toLowerCase();
      if (q.length < 2) throw invalid('q must be at least 2 characters');
      return {
        tasks: db.tasks
          .filter((t) => t.title.toLowerCase().includes(q) && canSeeTask(db, t, me!))
          .slice(0, 10)
          .map((t) => serializeTask(db, t)),
        projects: db.projects
          .filter((p) => p.name.toLowerCase().includes(q) && canSeeProject(db, p, me!))
          .slice(0, 10)
          .map((p) => serializeProject(db, p, me!)),
        users: db.users
          .filter((u) => u.isActive && (u.name.toLowerCase().includes(q) || u.email.includes(q)))
          .slice(0, 10)
          .map(summary),
      };
    },
  ],
];

const compiled = routes.map(([method, pattern, handler, opts]) => {
  const keys: string[] = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '$',
  );
  return { method, re, keys, handler, isPublic: !!opts?.public };
});

export type MockResponse = { status: number; body?: unknown };

/** Route a request against the mock DB. Mutates `db`. */
export function handleMockRequest(
  db: MockDb,
  method: string,
  path: string,
  query: URLSearchParams,
  body: unknown,
): MockResponse {
  try {
    const route = compiled.find((r) => r.method === method && r.re.test(path));
    if (!route) throw notFound();
    const m = path.match(route.re)!;
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const me = db.users.find((u) => u.id === db.sessionUserId && u.isActive) ?? null;
    if (!route.isPublic && !me) throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
    const out = route.handler({ db, method, params, query, body, me });
    if (out && typeof out === 'object' && 'status' in out && typeof out.status === 'number') {
      return out as Result;
    }
    return { status: 200, body: out };
  } catch (e) {
    if (e instanceof HttpError) {
      const error = { code: e.code, message: e.message, ...(e.details !== undefined && { details: e.details }) };
      return { status: e.status, body: { error } };
    }
    return {
      status: 500,
      body: { error: { code: 'INTERNAL', message: e instanceof Error ? e.message : 'error' } },
    };
  }
}

/** A fetch-compatible function that serves `/api/v1/*` from the mock DB. */
export function createMockFetch(
  getDb: () => MockDb,
  opts: { latencyMs?: number; onChange?: (db: MockDb) => void } = {},
) {
  return async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input, 'http://mock.local');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
    if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
    const db = getDb();
    const res = handleMockRequest(db, method, path, url.searchParams, body);
    if (method !== 'GET') opts.onChange?.(db);
    // Clone through JSON so callers can't mutate DB rows by reference.
    const text = res.body === undefined ? null : JSON.stringify(res.body);
    return new Response(res.status === 204 ? null : text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
