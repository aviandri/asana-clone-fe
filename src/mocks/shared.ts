// Helpers shared by the mock route modules (core routes in backend.ts, goals.ts, reports.ts).
import type {
  ErrorCode,
  Project,
  ProjectDetail,
  Task,
  TaskDetail,
  Team,
  TeamDetail,
  User,
  UserSummary,
} from '@/api/types';
import { type MockDb, type ProjectRow, type TaskRow, type UserRow } from './db';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, 'NOT_FOUND', 'Not found');
export const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Forbidden');
export const invalid = (msg: string) => new HttpError(400, 'VALIDATION', msg);

export type Ctx = {
  db: MockDb;
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  me: UserRow | null;
};
/** `raw` responses (e.g. CSV) bypass JSON encoding. */
export type Result = { status: number; body?: unknown; raw?: string; contentType?: string; filename?: string };
export type Handler = (ctx: Ctx) => Result | unknown;

export const nowIso = () => new Date().toISOString();

// ---------- serializers ----------

export const summary = (u: UserRow): UserSummary => ({
  id: u.id,
  name: u.name,
  email: u.email,
  avatarColor: u.avatarColor,
});
export const fullUser = (u: UserRow): User => ({ ...summary(u), role: u.role, isActive: u.isActive, createdAt: u.createdAt });
export const userById = (db: MockDb, id: string) => {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw notFound();
  return u;
};

export function serializeTeam(db: MockDb, t: MockDb['teams'][number]): Team {
  return {
    ...t,
    memberCount: db.teamMembers.filter((m) => m.teamId === t.id).length,
  };
}
export function serializeTeamDetail(db: MockDb, t: MockDb['teams'][number]): TeamDetail {
  return {
    ...serializeTeam(db, t),
    members: db.teamMembers
      .filter((m) => m.teamId === t.id)
      .map((m) => summary(userById(db, m.userId))),
  };
}

export function serializeProject(db: MockDb, p: ProjectRow, me: UserRow): Project {
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
export function serializeProjectDetail(db: MockDb, p: ProjectRow, me: UserRow): ProjectDetail {
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

export function serializeTask(db: MockDb, t: TaskRow): Task {
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
export function serializeTaskDetail(db: MockDb, t: TaskRow): TaskDetail {
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

export function canSeeProject(db: MockDb, p: ProjectRow, me: UserRow) {
  if (me.role === 'ADMIN' || p.privacy === 'PUBLIC') return true;
  if (db.projectMembers.some((m) => m.projectId === p.id && m.userId === me.id)) return true;
  if (p.privacy === 'TEAM') {
    return db.teamMembers.some((m) => m.teamId === p.teamId && m.userId === me.id);
  }
  return false;
}
export function visibleProject(db: MockDb, id: string, me: UserRow) {
  const p = db.projects.find((x) => x.id === id);
  if (!p || !canSeeProject(db, p, me)) throw notFound();
  return p;
}
export function assertCanEditProjectContent(db: MockDb, p: ProjectRow, me: UserRow) {
  if (me.role === 'ADMIN') return;
  const m = db.projectMembers.find((x) => x.projectId === p.id && x.userId === me.id);
  if (m?.role === 'COMMENTER') throw forbidden();
}
export function assertProjectOwner(db: MockDb, p: ProjectRow, me: UserRow) {
  if (me.role === 'ADMIN') return;
  const m = db.projectMembers.find((x) => x.projectId === p.id && x.userId === me.id);
  if (m?.role !== 'OWNER') throw forbidden();
}
export function canSeeTask(db: MockDb, t: TaskRow, me: UserRow): boolean {
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
export function visibleTask(db: MockDb, id: string, me: UserRow) {
  const t = db.tasks.find((x) => x.id === id);
  if (!t || !canSeeTask(db, t, me)) throw notFound();
  return t;
}
export function assertCanEditTask(db: MockDb, t: TaskRow, me: UserRow) {
  if (!t.projectId) return;
  assertCanEditProjectContent(db, db.projects.find((p) => p.id === t.projectId)!, me);
}
/** 400 VALIDATION when `user` couldn't see the task's project (assigning / adding followers). */
export function assertCanSeeTaskProject(db: MockDb, t: TaskRow, user: UserRow, field: string) {
  if (!t.projectId) return;
  const p = db.projects.find((x) => x.id === t.projectId)!;
  if (!canSeeProject(db, p, user)) {
    const message = `${user.name} doesn’t have access to this project`;
    // Same shape as the BE (zod issues): [{ path: [field], message }]
    throw new HttpError(400, 'VALIDATION', message, [{ path: [field], message }]);
  }
}

export function assertNotLastOwner(db: MockDb, projectId: string) {
  const owners = db.projectMembers.filter((m) => m.projectId === projectId && m.role === 'OWNER');
  if (owners.length <= 1) throw new HttpError(409, 'CONFLICT', 'A project must keep at least one owner');
}
export const requireAdmin = (me: UserRow) => {
  if (me.role !== 'ADMIN') throw forbidden();
};

