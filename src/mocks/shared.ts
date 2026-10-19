// Helpers shared by the mock route modules (core routes in backend.ts, goals.ts, reports.ts).
import type {
  Attachment,
  ErrorCode,
  Me,
  Project,
  ProjectDetail,
  Task,
  TaskDetail,
  Team,
  TeamDetail,
  User,
  UserSummary,
  Workspace,
  WorkspaceRole,
} from '@/api/types';
import { type AttachmentRow, type MockDb, type ProjectRow, type TaskRow, type UserRow, type WorkspaceMemberRow, type WorkspaceRow } from './db';

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
  /** Raw X-Workspace-Id header. */
  header: string | null;
  /** The request's workspace (SPEC §12) for scoped endpoints: 404 for a header naming a workspace
   *  the caller isn't an active member of, 403 NO_WORKSPACE when they have none. */
  ws: () => WorkspaceRow;
  /** The caller's role in `ws()`. */
  role: () => WorkspaceRole;
  /** Like `ws()` but lenient (bad header → fallback, none → null); for /auth/me and friends. */
  wsOrNull: () => WorkspaceRow | null;
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

// ---------- workspaces (SPEC §12) ----------

export const membershipOf = (db: MockDb, workspaceId: string, userId: string): WorkspaceMemberRow | undefined =>
  db.workspaceMembers.find((m) => m.workspaceId === workspaceId && m.userId === userId);
/** Role of an *active* member, else null. */
export function roleIn(db: MockDb, workspaceId: string, userId: string): WorkspaceRole | null {
  const m = membershipOf(db, workspaceId, userId);
  return m?.isActive ? m.role : null;
}
export const activeMembers = (db: MockDb, workspaceId: string) =>
  db.workspaceMembers.filter((m) => m.workspaceId === workspaceId && m.isActive);

/** The workspace a request runs in. `header` = X-Workspace-Id. */
export function resolveWorkspace(db: MockDb, me: UserRow, header: string | null, lenient = false): WorkspaceRow | null {
  const byId = (id: string | null) => (id && roleIn(db, id, me.id) ? db.workspaces.find((w) => w.id === id) : undefined);
  if (header) {
    const w = byId(header);
    if (w) return w;
    if (!lenient) throw notFound();
  }
  const last = byId(me.lastWorkspaceId);
  if (last) return last;
  const oldest = db.workspaceMembers
    .filter((m) => m.userId === me.id && m.isActive)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
  const w = oldest ? db.workspaces.find((x) => x.id === oldest.workspaceId) : undefined;
  if (w) return w;
  if (lenient) return null;
  throw new HttpError(403, 'FORBIDDEN', 'You are not a member of any workspace', [{ path: ['workspace'], message: 'NO_WORKSPACE' }]);
}

export function serializeWorkspace(db: MockDb, w: WorkspaceRow, userId: string): Workspace {
  return {
    id: w.id,
    name: w.name,
    isOrganization: w.isOrganization,
    domain: w.domain,
    color: w.color,
    myRole: roleIn(db, w.id, userId) ?? 'MEMBER',
    memberCount: activeMembers(db, w.id).length,
    createdAt: w.createdAt,
  };
}
export const myWorkspaces = (db: MockDb, userId: string) =>
  db.workspaces
    .filter((w) => roleIn(db, w.id, userId))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((w) => serializeWorkspace(db, w, userId));

/** `role` = role in `ws` (the current workspace); a user without one reads as MEMBER. */
export const fullUser = (db: MockDb, u: UserRow, ws: WorkspaceRow | null): User => ({
  ...summary(u),
  role: (ws && membershipOf(db, ws.id, u.id)?.role) || 'MEMBER',
  isActive: u.isActive,
  createdAt: u.createdAt,
});
/** /admin/users: the membership's role and active flag. */
export const memberUser = (u: UserRow, m: WorkspaceMemberRow): User => ({
  ...summary(u),
  role: m.role,
  isActive: m.isActive,
  createdAt: u.createdAt,
});
export const serializeMe = (db: MockDb, u: UserRow, ws: WorkspaceRow | null): Me => ({
  ...fullUser(db, u, ws),
  isActive: true,
  currentWorkspace: ws ? serializeWorkspace(db, ws, u.id) : null,
  workspaces: myWorkspaces(db, u.id),
});

export const onDomain = (email: string, domain: string | null) => !!domain && email.toLowerCase().endsWith(`@${domain}`);

export function assertNotLastAdmin(db: MockDb, workspaceId: string) {
  if (activeMembers(db, workspaceId).filter((m) => m.role === 'ADMIN').length <= 1)
    throw new HttpError(409, 'CONFLICT', 'A workspace must keep at least one admin');
}

/** 400 VALIDATION on `field` unless `userId` is an active member of the workspace (no cross-workspace refs). */
export function assertWorkspaceMember(db: MockDb, workspaceId: string, userId: string, field: string, opts: { noGuests?: boolean | string } = {}) {
  const role = roleIn(db, workspaceId, userId);
  const user = db.users.find((u) => u.id === userId);
  let message: string | null = null;
  if (!user || !role) message = `${user?.name ?? 'That person'} isn’t a member of this workspace`;
  else if (opts.noGuests && role === 'GUEST') message = typeof opts.noGuests === 'string' ? opts.noGuests : 'Guests can’t join teams';
  if (message) throw new HttpError(400, 'VALIDATION', message, [{ path: [field], message }]);
}

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
    workspaceId: p.workspaceId,
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
    workspaceId: t.workspaceId,
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
    attachmentCount: (db.attachments ?? []).filter((a) => a.taskId === t.id && !a.draft).length,
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
    attachments: (db.attachments ?? [])
      .filter((a) => a.taskId === t.id && !a.draft)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map((a) => serializeAttachment(db, a)),
  };
}

export function serializeAttachment(db: MockDb, a: AttachmentRow): Attachment {
  const file = a.kind === 'FILE';
  // The real server derives these paths; the mock hands out the browser-loadable URL instead.
  const contentPath = file ? (a.contentUrl ?? `/api/v1/attachments/${a.id}/content`) : null;
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    taskId: a.taskId,
    commentId: a.commentId,
    kind: a.kind,
    draft: a.draft,
    uploader: summary(userById(db, a.uploaderId)),
    createdAt: a.createdAt,
    name: file ? a.name : null,
    mimeType: file ? a.mimeType : null,
    size: file ? a.size : null,
    width: a.width,
    height: a.height,
    hasThumbnail: false,
    url: file ? null : a.url,
    title: file ? null : a.title,
    description: file ? null : a.description,
    siteName: file ? null : a.siteName,
    provider: file ? null : a.provider,
    previewStatus: file ? null : a.previewStatus,
    hasIcon: false,
    hasImage: false,
    contentPath,
    thumbnailPath: null,
    iconPath: null,
    imagePath: null,
  };
}

// ---------- permissions (role = the caller's role in the resource's own workspace) ----------

export function canSeeProject(db: MockDb, p: ProjectRow, me: UserRow) {
  const role = roleIn(db, p.workspaceId, me.id);
  if (!role) return false;
  const isMember = db.projectMembers.some((m) => m.projectId === p.id && m.userId === me.id);
  if (role === 'GUEST') return isMember; // privacy ignored for guests
  if (role === 'ADMIN' || p.privacy === 'PUBLIC' || isMember) return true;
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
export function visibleTeam(db: MockDb, id: string, me: UserRow) {
  const t = db.teams.find((x) => x.id === id);
  const role = t && roleIn(db, t.workspaceId, me.id);
  if (!t || !role || role === 'GUEST') throw notFound(); // W1: guests are never team members
  return t;
}
const isWsAdmin = (db: MockDb, workspaceId: string, me: UserRow) => roleIn(db, workspaceId, me.id) === 'ADMIN';
export function assertCanEditProjectContent(db: MockDb, p: ProjectRow, me: UserRow) {
  if (isWsAdmin(db, p.workspaceId, me)) return;
  const m = db.projectMembers.find((x) => x.projectId === p.id && x.userId === me.id);
  if (m?.role === 'COMMENTER') throw forbidden();
}
export function assertProjectOwner(db: MockDb, p: ProjectRow, me: UserRow) {
  if (isWsAdmin(db, p.workspaceId, me)) return;
  if (roleIn(db, p.workspaceId, me.id) === 'GUEST') throw forbidden(); // W7: guests never manage projects
  const m = db.projectMembers.find((x) => x.projectId === p.id && x.userId === me.id);
  if (m?.role !== 'OWNER') throw forbidden();
}
export function canSeeTask(db: MockDb, t: TaskRow, me: UserRow): boolean {
  const role = roleIn(db, t.workspaceId, me.id);
  if (!role) return false;
  if (t.projectId) {
    const p = db.projects.find((x) => x.id === t.projectId);
    return !!p && canSeeProject(db, p, me);
  }
  if (role === 'ADMIN') return true;
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
/** 400 VALIDATION when `user` isn't in the task's workspace or couldn't see its project (assigning / adding followers). */
export function assertCanSeeTaskProject(db: MockDb, t: TaskRow, user: UserRow, field: string) {
  assertWorkspaceMember(db, t.workspaceId, user.id, field);
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
export const requireAdmin = (role: WorkspaceRole | null) => {
  if (role !== 'ADMIN') throw forbidden();
};
export const forbidGuest = (role: WorkspaceRole) => {
  if (role === 'GUEST') throw forbidden();
};

/**
 * Deactivation / leaving (SPEC §12): drop the user's team and project memberships in the
 * workspace; a project left without an OWNER passes to `heirId` (the acting admin).
 */
export function removeFromWorkspace(db: MockDb, workspaceId: string, userId: string, heirId: string | null) {
  const teamIds = new Set(db.teams.filter((t) => t.workspaceId === workspaceId).map((t) => t.id));
  db.teamMembers = db.teamMembers.filter((m) => !(m.userId === userId && teamIds.has(m.teamId)));
  for (const p of db.projects.filter((x) => x.workspaceId === workspaceId)) {
    const mine = db.projectMembers.find((m) => m.projectId === p.id && m.userId === userId);
    if (!mine) continue;
    db.projectMembers = db.projectMembers.filter((m) => m !== mine);
    const heir = heirId && heirId !== userId ? heirId : (activeMembers(db, workspaceId).find((m) => m.role === 'ADMIN' && m.userId !== userId)?.userId ?? null);
    if (mine.role === 'OWNER' && heir && !db.projectMembers.some((m) => m.projectId === p.id && m.role === 'OWNER')) {
      const existing = db.projectMembers.find((m) => m.projectId === p.id && m.userId === heir);
      if (existing) existing.role = 'OWNER';
      else db.projectMembers.push({ projectId: p.id, userId: heir, role: 'OWNER' });
    }
  }
}

/** The project-ownership heir when `userId` stops owning: the acting admin, else the longest-standing other admin (W7). */
function ownerHeir(db: MockDb, workspaceId: string, userId: string, actingId: string | null) {
  if (actingId && actingId !== userId) return actingId;
  return (
    activeMembers(db, workspaceId)
      .filter((m) => m.role === 'ADMIN' && m.userId !== userId)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0]?.userId ?? null
  );
}

/**
 * Someone becomes a GUEST (role change or organization conversion): they leave the workspace's
 * teams (W4), and their OWNER project memberships become EDITOR, passing ownerless projects on (W7).
 */
export function demoteToGuest(db: MockDb, m: WorkspaceMemberRow, actingId: string | null) {
  if (m.role === 'GUEST') return;
  m.role = 'GUEST';
  const teamIds = new Set(db.teams.filter((t) => t.workspaceId === m.workspaceId).map((t) => t.id));
  db.teamMembers = db.teamMembers.filter((tm) => !(tm.userId === m.userId && teamIds.has(tm.teamId)));
  for (const p of db.projects.filter((x) => x.workspaceId === m.workspaceId)) {
    const mine = db.projectMembers.find((pm) => pm.projectId === p.id && pm.userId === m.userId);
    if (mine?.role !== 'OWNER') continue;
    mine.role = 'EDITOR';
    if (db.projectMembers.some((pm) => pm.projectId === p.id && pm.role === 'OWNER')) continue;
    const heir = ownerHeir(db, m.workspaceId, m.userId, actingId);
    if (!heir) continue;
    const existing = db.projectMembers.find((pm) => pm.projectId === p.id && pm.userId === heir);
    if (existing) existing.role = 'OWNER';
    else db.projectMembers.push({ projectId: p.id, userId: heir, role: 'OWNER' });
  }
}
