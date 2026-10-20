// A small in-process implementation of the API contract (docs/SPEC.md §6), used when the real
// backend isn't available (VITE_MOCK=true) and in tests. Not meant to be exhaustive — just
// faithful enough that the UI can be developed and tested against it.
import type {
  Invite,
  Notification,
  Story,
} from '@/api/types';
import type { UploadTransport } from '@/api/upload';
import { attachmentRoutes } from './attachments';
import { goalRoutes } from './goals';
import { reportRoutes } from './reports';
import { revokeAllTokens, tokenRoutes } from './tokens';
import { workspaceRoutes } from './workspaces';
import { uid, type MockDb, type ProjectRow, type TaskRow, type UserRow } from './db';

import {
  HttpError,
  notFound,
  forbidden,
  invalid,
  nowIso,
  summary,
  fullUser,
  memberUser,
  serializeMe,
  membershipOf,
  roleIn,
  activeMembers,
  resolveWorkspace,
  assertWorkspaceMember,
  removeFromWorkspace,
  assertNotLastAdmin,
  onDomain,
  forbidGuest,
  visibleTeam,
  demoteToGuest,
  userById,
  serializeTeam,
  serializeTeamDetail,
  serializeProject,
  serializeProjectDetail,
  serializeTask,
  serializeTaskDetail,
  serializeAttachment,
  canSeeProject,
  visibleProject,
  assertCanEditProjectContent,
  assertProjectOwner,
  canSeeTask,
  visibleTask,
  assertCanEditTask,
  assertCanSeeTaskProject,
  assertNotLastOwner,
  requireAdmin,
  type Result,
  type Handler,
} from './shared';

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
  const workspaceId = db.tasks.find((t) => t.id === taskId)?.workspaceId;
  if (!workspaceId) return;
  db.notifications.push({
    id: uid(db, 'ntfy'),
    workspaceId,
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
    if (pid && visibleProject(db, pid, me).workspaceId !== t.workspaceId) {
      const message = 'Tasks can’t move to a project in another workspace';
      throw new HttpError(400, 'VALIDATION', message, [{ path: ['projectId'], message }]);
    }
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
  if (db.attachments) db.attachments = db.attachments.filter((a) => !ids.has(a.taskId));
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
      attachments: (db.attachments ?? [])
        .filter((a) => a.commentId === c.id && !a.draft)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((a) => serializeAttachment(db, a)),
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
    workspaceId: i.workspaceId,
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

const ROLES = ['ADMIN', 'MEMBER', 'GUEST'];

/** W7: a GUEST can't be a project OWNER. */
function assertNotGuestOwner(db: MockDb, workspaceId: string, userId: string, role: unknown) {
  if (role === 'OWNER' && roleIn(db, workspaceId, userId) === 'GUEST') {
    const message = 'Guests can’t own projects';
    throw new HttpError(400, 'VALIDATION', message, [{ path: ['role'], message }]);
  }
}
const EXTERNAL_GUEST = 'External people can only be guests';

/** /users and the @mention picker: active members; a guest only sees people they share a project with. */
function pickableUsers(db: MockDb, workspaceId: string, me: UserRow, role: string) {
  const ids = new Set(activeMembers(db, workspaceId).map((m) => m.userId));
  if (role === 'GUEST') {
    const mine = new Set(db.projectMembers.filter((m) => m.userId === me.id).map((m) => m.projectId));
    const shared = new Set(db.projectMembers.filter((m) => mine.has(m.projectId)).map((m) => m.userId));
    for (const id of ids) if (!shared.has(id) && id !== me.id) ids.delete(id);
  }
  return db.users.filter((u) => u.isActive && ids.has(u.id));
}

// ---------- routes ----------

const routes: [string, string, Handler, { public?: boolean }?][] = [
  ['GET', '/health', () => ({ ok: true }), { public: true }],

  // auth
  [
    'POST',
    '/auth/login',
    ({ db, body, header }) => {
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
      return serializeMe(db, u, resolveWorkspace(db, u, header, true));
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
  ['GET', '/auth/me', ({ db, me, wsOrNull }) => serializeMe(db, me!, wsOrNull())],
  [
    'GET',
    '/auth/invites/:token',
    ({ db, params }) => {
      const inv = usableInvite(db, params.token);
      const w = db.workspaces.find((x) => x.id === inv.workspaceId)!;
      return {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        workspace: { id: w.id, name: w.name, color: w.color },
        existingUser: db.users.some((u) => u.email === inv.email),
      };
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
      // New users only; an existing account logs in and accepts via /me/invites/:id/accept.
      if (db.users.some((u) => u.email === inv.email)) throw new HttpError(409, 'CONFLICT', 'An account with this email already exists');
      const u: UserRow = {
        id: uid(db, 'user'),
        email: inv.email,
        name,
        password,
        isActive: true,
        avatarColor: '#9ee7e3',
        createdAt: nowIso(),
        lastWorkspaceId: inv.workspaceId,
      };
      db.users.push(u);
      db.workspaceMembers.push({ workspaceId: inv.workspaceId, userId: u.id, role: inv.role, isActive: true, joinedAt: nowIso() });
      inv.acceptedAt = nowIso();
      db.sessionUserId = u.id;
      return serializeMe(db, u, db.workspaces.find((w) => w.id === inv.workspaceId)!);
    },
    { public: true },
  ],

  // users
  [
    'GET',
    '/users',
    ({ db, me, ws, role, query }) => {
      const q = (query.get('q') ?? '').toLowerCase();
      return {
        data: pickableUsers(db, ws().id, me!, role())
          .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.includes(q))
          .map((u) => ({ ...summary(u), role: roleIn(db, ws().id, u.id)! })),
      };
    },
  ],
  [
    'GET',
    '/users/:id',
    ({ db, me, params, wsOrNull }) => {
      const w = wsOrNull();
      // W7: a guest only finds people they share a project with.
      if (w && roleIn(db, w.id, me!.id) === 'GUEST' && !pickableUsers(db, w.id, me!, 'GUEST').some((u) => u.id === params.id)) throw notFound();
      return fullUser(db, userById(db, params.id), w);
    },
  ],
  [
    'PATCH',
    '/users/me',
    ({ db, me, body, wsOrNull }) => {
      if (body.newPassword) {
        if (body.currentPassword !== me!.password) throw invalid('Current password is incorrect');
        me!.password = body.newPassword;
        revokeAllTokens(db, me!.id);
      }
      if (body.name !== undefined) me!.name = String(body.name);
      if (body.avatarColor !== undefined) me!.avatarColor = String(body.avatarColor);
      return fullUser(db, me!, wsOrNull());
    },
  ],

  // admin (members and invites of the current workspace)
  [
    'GET',
    '/admin/users',
    ({ db, ws, role }) => {
      requireAdmin(role());
      return {
        data: db.workspaceMembers
          .filter((m) => m.workspaceId === ws().id)
          .map((m) => memberUser(userById(db, m.userId), m))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
  ],
  [
    'PATCH',
    '/admin/users/:id',
    ({ db, me, ws, role, params, body }) => {
      requireAdmin(role());
      const w = ws();
      const m = membershipOf(db, w.id, params.id);
      if (!m) throw notFound();
      const u = userById(db, m.userId);
      const demoting = body.role !== undefined && body.role !== 'ADMIN';
      const deactivating = body.isActive === false;
      if (m.role === 'ADMIN' && m.isActive && (demoting || deactivating)) assertNotLastAdmin(db, w.id);
      if (body.role !== undefined) {
        if (!ROLES.includes(body.role)) throw invalid('bad role');
        if (w.isOrganization && body.role !== 'GUEST' && !onDomain(u.email, w.domain)) {
          throw new HttpError(400, 'VALIDATION', EXTERNAL_GUEST, [{ path: ['role'], message: EXTERNAL_GUEST }]);
        }
        if (body.role === 'GUEST') demoteToGuest(db, m, me!.id);
        else m.role = body.role;
      }
      if (body.isActive !== undefined) {
        if (m.isActive && !body.isActive) removeFromWorkspace(db, w.id, m.userId, me!.id);
        m.isActive = !!body.isActive;
      }
      return memberUser(u, m);
    },
  ],
  [
    'GET',
    '/admin/invites',
    ({ db, ws, role }) => {
      requireAdmin(role());
      return {
        data: db.invites
          .filter((i) => i.workspaceId === ws().id && !i.acceptedAt)
          .map((i) => serializeInvite(db, i)),
      };
    },
  ],
  [
    'POST',
    '/admin/invites',
    ({ db, me, ws, role, body }) => {
      requireAdmin(role());
      const w = ws();
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw invalid('Invalid email');
      const inviteRole = body.role ?? 'MEMBER';
      if (!ROLES.includes(inviteRole)) throw invalid('bad role');
      if (w.isOrganization && inviteRole !== 'GUEST' && !onDomain(email, w.domain)) {
        throw new HttpError(400, 'VALIDATION', EXTERNAL_GUEST, [{ path: ['role'], message: EXTERNAL_GUEST }]);
      }
      const existing = db.users.find((u) => u.email === email);
      if (existing && roleIn(db, w.id, existing.id)) throw new HttpError(409, 'CONFLICT', 'Already a member of this workspace');
      if (db.invites.some((i) => i.workspaceId === w.id && i.email === email && !i.acceptedAt))
        throw new HttpError(409, 'CONFLICT', 'There is already a pending invite for this email');
      const token = uid(db, 'tokn').replace(/-/g, '');
      const inv = {
        id: uid(db, 'invt'),
        workspaceId: w.id,
        email,
        role: inviteRole,
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
    ({ db, ws, role, params }) => {
      requireAdmin(role());
      db.invites = db.invites.filter((i) => !(i.id === params.id && i.workspaceId === ws().id));
      return { status: 204 };
    },
  ],

  // teams
  [
    'GET',
    '/teams',
    ({ db, me, ws, role, query }) => {
      const mine = query.get('mine') === 'true';
      const wsId = ws().id;
      if (role() === 'GUEST') return { data: [] }; // W1
      return {
        data: db.teams
          .filter((t) => t.workspaceId === wsId)
          .filter((t) => !mine || db.teamMembers.some((m) => m.teamId === t.id && m.userId === me!.id))
          .map((t) => serializeTeam(db, t)),
      };
    },
  ],
  [
    'POST',
    '/teams',
    ({ db, me, ws, role, body }) => {
      forbidGuest(role());
      const name = String(body?.name ?? '').trim();
      if (!name) throw invalid('name is required');
      const t = { id: uid(db, 'team'), workspaceId: ws().id, name, description: body.description ?? null, createdAt: nowIso() };
      db.teams.push(t);
      db.teamMembers.push({ teamId: t.id, userId: me!.id });
      return { status: 201, body: serializeTeamDetail(db, t) };
    },
  ],
  [
    'GET',
    '/teams/:id',
    ({ db, me, params }) => serializeTeamDetail(db, visibleTeam(db, params.id, me!)),
  ],
  [
    'PATCH',
    '/teams/:id',
    ({ db, me, params, body }) => {
      const t = visibleTeam(db, params.id, me!);
      const isMember = db.teamMembers.some((m) => m.teamId === t.id && m.userId === me!.id);
      if (!isMember && roleIn(db, t.workspaceId, me!.id) !== 'ADMIN') throw forbidden();
      if (body.name !== undefined) t.name = String(body.name);
      if (body.description !== undefined) t.description = body.description;
      return serializeTeamDetail(db, t);
    },
  ],
  [
    'DELETE',
    '/teams/:id',
    ({ db, me, params }) => {
      requireAdmin(roleIn(db, visibleTeam(db, params.id, me!).workspaceId, me!.id));
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
    ({ db, me, params, body }) => {
      const t = visibleTeam(db, params.id, me!);
      assertWorkspaceMember(db, t.workspaceId, String(body?.userId ?? ''), 'userId', { noGuests: true });
      if (!db.teamMembers.some((m) => m.teamId === t.id && m.userId === body.userId))
        db.teamMembers.push({ teamId: t.id, userId: body.userId });
      return serializeTeamDetail(db, t);
    },
  ],
  [
    'DELETE',
    '/teams/:id/members/:userId',
    ({ db, me, params }) => {
      const t = visibleTeam(db, params.id, me!);
      db.teamMembers = db.teamMembers.filter((m) => !(m.teamId === t.id && m.userId === params.userId));
      return serializeTeamDetail(db, t);
    },
  ],

  // projects
  [
    'GET',
    '/projects',
    ({ db, me, ws, query }) => {
      const teamId = query.get('teamId');
      const archived = bool(query.get('archived'));
      const q = (query.get('q') ?? '').toLowerCase();
      const wsId = ws().id;
      return {
        data: db.projects
          .filter((p) => p.workspaceId === wsId && canSeeProject(db, p, me!))
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
    ({ db, me, ws, role, body }) => {
      forbidGuest(role());
      const name = String(body?.name ?? '').trim();
      if (!name) throw invalid('name is required');
      const w = ws();
      if (!db.teams.some((t) => t.id === body.teamId && t.workspaceId === w.id)) throw invalid('teamId is invalid');
      const inTeam = db.teamMembers.some((m) => m.teamId === body.teamId && m.userId === me!.id);
      if (!inTeam && role() !== 'ADMIN') throw forbidden();
      const p: ProjectRow = {
        id: uid(db, 'proj'),
        workspaceId: w.id,
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
      assertWorkspaceMember(db, p.workspaceId, String(body?.userId ?? ''), 'userId');
      assertNotGuestOwner(db, p.workspaceId, String(body.userId), body.role);
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
      assertNotGuestOwner(db, p.workspaceId, m.userId, body.role);
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
    ({ db, me, ws, query }) => {
      const completed = bool(query.get('completed'));
      const wsId = ws().id;
      return {
        data: db.tasks
          .filter((t) => t.workspaceId === wsId && t.assigneeId === me!.id && (completed === undefined || t.completed === completed))
          .filter((t) => canSeeTask(db, t, me!))
          .sort((a, b) => a.position - b.position)
          .map((t) => serializeTask(db, t)),
      };
    },
  ],
  [
    'POST',
    '/tasks',
    ({ db, me, ws, body }) => {
      const title = String(body?.title ?? '').trim();
      if (!title) throw invalid('title is required');
      let projectId: string | null = body.projectId ?? null;
      // A subtask / project task lives in its parent's / project's workspace; a personal task in the current one.
      let workspaceId: string | null = null;
      if (body.parentId) {
        const parent = visibleTask(db, body.parentId, me!);
        projectId = parent.projectId;
        workspaceId = parent.workspaceId;
      }
      if (projectId) {
        const p = visibleProject(db, projectId, me!);
        assertCanEditProjectContent(db, p, me!);
        workspaceId = p.workspaceId;
      }
      const siblings = db.tasks.filter((t) =>
        body.parentId ? t.parentId === body.parentId : t.projectId === projectId && t.sectionId === (body.sectionId ?? null),
      );
      const t: TaskRow = {
        id: uid(db, 'task'),
        workspaceId: workspaceId ?? ws().id,
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
      // §13: drafts the caller uploaded to this task (≤ 20) become the comment's; then body may be empty.
      const ids: unknown = body?.attachmentIds ?? [];
      const badIds = () => new HttpError(400, 'VALIDATION', 'Invalid attachmentIds', [{ path: ['attachmentIds'], message: 'Invalid' }]);
      if (!Array.isArray(ids) || ids.length > 20) throw badIds();
      const drafts = ids.map((id) => (db.attachments ?? []).find((a) => a.id === id));
      if (drafts.some((a) => !a || !a.draft || a.uploaderId !== me!.id || a.taskId !== t.id)) throw badIds();
      if (!text && drafts.length === 0) throw invalid('body is required');
      mentionedIds(text).forEach((id) => assertWorkspaceMember(db, t.workspaceId, id, 'body'));
      const c = { id: uid(db, 'cmnt'), taskId: t.id, authorId: me!.id, body: text, createdAt: nowIso(), editedAt: null };
      db.comments.push(c);
      for (const a of drafts) Object.assign(a!, { draft: false, commentId: c.id });
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
      const t = db.tasks.find((x) => x.id === c.taskId);
      if (c.authorId !== me!.id && !(t && roleIn(db, t.workspaceId, me!.id) === 'ADMIN')) throw forbidden();
      db.comments = db.comments.filter((x) => x.id !== c.id);
      if (db.attachments) db.attachments = db.attachments.filter((a) => a.commentId !== c.id);
      return { status: 204 };
    },
  ],

  // notifications
  [
    'GET',
    '/notifications',
    ({ db, me, ws, query }) => {
      const unread = query.get('unread') === 'true';
      const limit = Number(query.get('limit') ?? 50);
      const wsId = ws().id;
      const mine = db.notifications.filter((n) => n.userId === me!.id && n.workspaceId === wsId);
      const data: Notification[] = mine
        .filter((n) => !unread || !n.read)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map((n) => {
          const task = n.taskId ? db.tasks.find((t) => t.id === n.taskId) : null;
          return {
            id: n.id,
            workspaceId: n.workspaceId,
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
    ({ db, me, ws }) => {
      const wsId = ws().id;
      db.notifications.forEach((n) => {
        if (n.userId === me!.id && n.workspaceId === wsId) n.read = true;
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
    ({ db, me, ws, role, query }) => {
      const q = (query.get('q') ?? '').trim().toLowerCase();
      if (q.length < 2) throw invalid('q must be at least 2 characters');
      const wsId = ws().id;
      return {
        tasks: db.tasks
          .filter((t) => t.workspaceId === wsId && t.title.toLowerCase().includes(q) && canSeeTask(db, t, me!))
          .slice(0, 10)
          .map((t) => serializeTask(db, t)),
        projects: db.projects
          .filter((p) => p.workspaceId === wsId && p.name.toLowerCase().includes(q) && canSeeProject(db, p, me!))
          .slice(0, 10)
          .map((p) => serializeProject(db, p, me!)),
        users: pickableUsers(db, wsId, me!, role())
          .filter((u) => u.name.toLowerCase().includes(q) || u.email.includes(q))
          .slice(0, 10)
          .map(summary),
      };
    },
  ],
];

const compiled = [...routes, ...workspaceRoutes, ...goalRoutes, ...reportRoutes, ...attachmentRoutes, ...tokenRoutes].map(([method, pattern, handler, opts]) => {
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

export type MockResponse = Result;

/** Route a request against the mock DB. Mutates `db`. */
export function handleMockRequest(
  db: MockDb,
  method: string,
  path: string,
  query: URLSearchParams,
  body: unknown,
  headers: { workspaceId?: string | null } = {},
): MockResponse {
  try {
    const route = compiled.find((r) => r.method === method && r.re.test(path));
    if (!route) throw notFound();
    const m = path.match(route.re)!;
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const me = db.users.find((u) => u.id === db.sessionUserId && u.isActive) ?? null;
    if (!route.isPublic && !me) throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
    const header = headers.workspaceId ?? null;
    const ws = () => resolveWorkspace(db, me!, header)!;
    const out = route.handler({
      db,
      method,
      params,
      query,
      body,
      me,
      header,
      ws,
      role: () => roleIn(db, ws().id, me!.id)!,
      wsOrNull: () => (me ? resolveWorkspace(db, me, header, true) : null),
    });
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
    const workspaceId = new Headers(init?.headers).get('X-Workspace-Id');
    const res = handleMockRequest(db, method, path, url.searchParams, body, { workspaceId });
    if (method !== 'GET') opts.onChange?.(db);
    // Clone through JSON so callers can't mutate DB rows by reference.
    if (res.raw !== undefined) {
      const headers: Record<string, string> = { 'Content-Type': res.contentType ?? 'text/plain' };
      if (res.filename) headers['Content-Disposition'] = `attachment; filename="${res.filename}"`;
      return new Response(res.raw, { status: res.status, headers });
    }
    const text = res.body === undefined ? null : JSON.stringify(res.body);
    return new Response(res.status === 204 ? null : text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

/**
 * An upload transport that serves `POST …/attachments` from the mock DB, reporting progress in a few
 * steps (spread over `latencyMs`) and honouring cancel.
 */
export function createMockUploadTransport(
  getDb: () => MockDb,
  opts: { latencyMs?: number; onChange?: (db: MockDb) => void } = {},
): UploadTransport {
  return async (input, file, { headers, onProgress, signal }) => {
    const aborted = () => new DOMException('Upload cancelled', 'AbortError');
    for (const step of [0.25, 0.5, 0.75, 1]) {
      if (signal?.aborted) throw aborted();
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs! / 4));
      if (signal?.aborted) throw aborted();
      onProgress?.(step);
    }
    const url = new URL(input, 'http://mock.local');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const db = getDb();
    const res = handleMockRequest(db, 'POST', path, url.searchParams, { file }, { workspaceId: headers['X-Workspace-Id'] ?? null });
    opts.onChange?.(db);
    return { status: res.status, text: res.body === undefined ? '' : JSON.stringify(res.body) };
  };
}
