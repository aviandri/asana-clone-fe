// Mock implementation of the Workspaces endpoints (SPEC §12).
import { uid, type MockDb, type WorkspaceRow } from './db';
import {
  HttpError,
  activeMembers,
  assertNotLastAdmin,
  demoteToGuest,
  onDomain,
  forbidden,
  membershipOf,
  notFound,
  nowIso,
  removeFromWorkspace,
  requireAdmin,
  roleIn,
  serializeWorkspace,
  summary,
  userById,
  type Handler,
} from './shared';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const fieldError = (field: string, message: string) => new HttpError(400, 'VALIDATION', message, [{ path: [field], message }]);
const emailDomain = (email: string) => email.toLowerCase().split('@')[1] ?? '';

/** A workspace the caller is an active member of (else 404, so ids don't leak). */
function memberWorkspace(db: MockDb, id: string, userId: string) {
  const w = db.workspaces.find((x) => x.id === id);
  if (!w || !roleIn(db, w.id, userId)) throw notFound();
  return w;
}

function addMember(db: MockDb, w: WorkspaceRow, userId: string, role: 'ADMIN' | 'MEMBER' | 'GUEST') {
  const m = membershipOf(db, w.id, userId);
  if (m) {
    if (!m.isActive) m.role = role;
    m.isActive = true;
  } else {
    db.workspaceMembers.push({ workspaceId: w.id, userId, role, isActive: true, joinedAt: nowIso() });
  }
}

/** Everything that lives in a workspace goes with it. */
function deleteWorkspace(db: MockDb, w: WorkspaceRow) {
  const projectIds = new Set(db.projects.filter((p) => p.workspaceId === w.id).map((p) => p.id));
  const taskIds = new Set(db.tasks.filter((t) => t.workspaceId === w.id).map((t) => t.id));
  const teamIds = new Set(db.teams.filter((t) => t.workspaceId === w.id).map((t) => t.id));
  const goalIds = new Set((db.goals ?? []).filter((g) => g.workspaceId === w.id).map((g) => g.id));
  db.tasks = db.tasks.filter((t) => !taskIds.has(t.id));
  db.followers = db.followers.filter((f) => !taskIds.has(f.taskId));
  db.comments = db.comments.filter((c) => !taskIds.has(c.taskId));
  db.activities = db.activities.filter((a) => !taskIds.has(a.taskId));
  db.notifications = db.notifications.filter((n) => n.workspaceId !== w.id);
  db.sections = db.sections.filter((s) => !projectIds.has(s.projectId));
  db.projectMembers = db.projectMembers.filter((m) => !projectIds.has(m.projectId));
  db.projects = db.projects.filter((p) => !projectIds.has(p.id));
  db.teamMembers = db.teamMembers.filter((m) => !teamIds.has(m.teamId));
  db.teams = db.teams.filter((t) => !teamIds.has(t.id));
  db.goals = (db.goals ?? []).filter((g) => !goalIds.has(g.id));
  db.keyResults = (db.keyResults ?? []).filter((k) => !goalIds.has(k.goalId));
  db.goalProjects = (db.goalProjects ?? []).filter((l) => !goalIds.has(l.goalId));
  db.goalUpdates = (db.goalUpdates ?? []).filter((u) => !goalIds.has(u.goalId));
  db.invites = db.invites.filter((i) => i.workspaceId !== w.id);
  db.workspaceMembers = db.workspaceMembers.filter((m) => m.workspaceId !== w.id);
  db.workspaces = db.workspaces.filter((x) => x.id !== w.id);
  db.users.forEach((u) => {
    if (u.lastWorkspaceId === w.id) u.lastWorkspaceId = null;
  });
}

function myPendingInvites(db: MockDb, email: string) {
  const now = new Date();
  return db.invites.filter((i) => i.email === email && !i.acceptedAt && new Date(i.expiresAt) > now);
}

export const workspaceRoutes: [string, string, Handler][] = [
  ['GET', '/workspaces', ({ db, me }) => ({ data: db.workspaces.filter((w) => roleIn(db, w.id, me!.id)).sort((a, b) => a.name.localeCompare(b.name)).map((w) => serializeWorkspace(db, w, me!.id)) })],
  [
    'POST',
    '/workspaces',
    ({ db, me, body }) => {
      const name = String(body?.name ?? '').trim();
      if (!name) throw fieldError('name', 'name is required');
      if (body.color !== undefined && !HEX_RE.test(String(body.color))) throw fieldError('color', 'color must be #RRGGBB');
      const w: WorkspaceRow = { id: uid(db, 'wksp'), name, isOrganization: false, domain: null, color: body.color ?? '#4186e0', createdAt: nowIso() };
      db.workspaces.push(w);
      addMember(db, w, me!.id, 'ADMIN');
      me!.lastWorkspaceId = w.id;
      return { status: 201, body: serializeWorkspace(db, w, me!.id) };
    },
  ],
  [
    'GET',
    '/workspaces/joinable',
    ({ db, me }) => {
      const domain = emailDomain(me!.email);
      return {
        data: db.workspaces
          // W3: a deactivated membership doesn't make the org joinable again.
          .filter((w) => w.isOrganization && w.domain === domain && !membershipOf(db, w.id, me!.id))
          .map((w) => ({ id: w.id, name: w.name, color: w.color, memberCount: activeMembers(db, w.id).length })),
      };
    },
  ],
  ['GET', '/workspaces/:id', ({ db, me, params }) => serializeWorkspace(db, memberWorkspace(db, params.id, me!.id), me!.id)],
  [
    'PATCH',
    '/workspaces/:id',
    ({ db, me, params, body }) => {
      const w = memberWorkspace(db, params.id, me!.id);
      requireAdmin(roleIn(db, w.id, me!.id));
      const b = body ?? {};
      if ('name' in b) {
        if (!String(b.name ?? '').trim()) throw fieldError('name', 'name is required');
        w.name = String(b.name).trim();
      }
      if ('color' in b) {
        if (!HEX_RE.test(String(b.color))) throw fieldError('color', 'color must be #RRGGBB');
        w.color = b.color;
      }
      let convertedToGuests: number | undefined;
      if (b.isOrganization === false) {
        w.isOrganization = false;
        w.domain = null;
      } else if (b.isOrganization === true || ('domain' in b && w.isOrganization)) {
        const domain = String(b.domain ?? w.domain ?? '').trim().toLowerCase();
        if (!DOMAIN_RE.test(domain)) throw fieldError('domain', 'Enter a domain like mekari.com');
        if (emailDomain(me!.email) !== domain) throw fieldError('domain', 'Your own email must be on this domain');
        if (db.workspaces.some((x) => x.id !== w.id && x.domain === domain))
          throw new HttpError(409, 'CONFLICT', 'Another workspace already uses this domain');
        w.isOrganization = true;
        w.domain = domain;
        convertedToGuests = 0;
        // W5: inactive memberships too (counted only when active), and pending invites.
        for (const m of db.workspaceMembers.filter((x) => x.workspaceId === w.id)) {
          if (m.role !== 'GUEST' && !onDomain(userById(db, m.userId).email, domain)) {
            if (m.isActive) convertedToGuests += 1;
            demoteToGuest(db, m, me!.id);
          }
        }
        for (const i of db.invites.filter((x) => x.workspaceId === w.id && !x.acceptedAt)) {
          if (!onDomain(i.email, domain)) i.role = 'GUEST';
        }
      }
      return { ...serializeWorkspace(db, w, me!.id), ...(convertedToGuests !== undefined && { convertedToGuests }) };
    },
  ],
  [
    'DELETE',
    '/workspaces/:id',
    ({ db, me, params, body }) => {
      const w = memberWorkspace(db, params.id, me!.id);
      requireAdmin(roleIn(db, w.id, me!.id));
      if (String(body?.confirmName ?? '') !== w.name) throw fieldError('confirmName', 'Type the workspace name to confirm');
      deleteWorkspace(db, w);
      return { status: 204 };
    },
  ],
  [
    'POST',
    '/workspaces/:id/switch',
    ({ db, me, params }) => {
      const w = memberWorkspace(db, params.id, me!.id);
      me!.lastWorkspaceId = w.id;
      return serializeWorkspace(db, w, me!.id);
    },
  ],
  [
    'POST',
    '/workspaces/:id/leave',
    ({ db, me, params }) => {
      const w = memberWorkspace(db, params.id, me!.id);
      if (roleIn(db, w.id, me!.id) === 'ADMIN') assertNotLastAdmin(db, w.id);
      removeFromWorkspace(db, w.id, me!.id, null);
      db.workspaceMembers = db.workspaceMembers.filter((m) => !(m.workspaceId === w.id && m.userId === me!.id));
      if (me!.lastWorkspaceId === w.id) me!.lastWorkspaceId = null;
      return { status: 204 };
    },
  ],
  [
    'POST',
    '/workspaces/:id/join',
    ({ db, me, params }) => {
      const w = db.workspaces.find((x) => x.id === params.id);
      if (!w) throw notFound();
      if (!w.isOrganization || w.domain !== emailDomain(me!.email)) throw forbidden();
      if (membershipOf(db, w.id, me!.id)?.isActive === false) throw forbidden(); // W3
      if (!roleIn(db, w.id, me!.id)) addMember(db, w, me!.id, 'MEMBER');
      return { status: 201, body: serializeWorkspace(db, w, me!.id) };
    },
  ],
  [
    'GET',
    '/me/invites',
    ({ db, me }) => ({
      data: myPendingInvites(db, me!.email).map((i) => {
        const w = db.workspaces.find((x) => x.id === i.workspaceId)!;
        return {
          id: i.id,
          workspace: { id: w.id, name: w.name, color: w.color },
          role: i.role,
          invitedBy: summary(userById(db, i.invitedById)),
          expiresAt: i.expiresAt,
        };
      }),
    }),
  ],
  [
    'POST',
    '/me/invites/:id/accept',
    ({ db, me, params }) => {
      const inv = myPendingInvites(db, me!.email).find((i) => i.id === params.id);
      if (!inv) throw notFound();
      const w = db.workspaces.find((x) => x.id === inv.workspaceId);
      if (!w) throw notFound();
      inv.acceptedAt = nowIso();
      const m = membershipOf(db, w.id, me!.id);
      if (m?.isActive) {
        // W6: already in — keep the current role; the invite is still used up.
      } else if (m) {
        m.role = inv.role;
        m.isActive = true;
      } else addMember(db, w, me!.id, inv.role);
      return serializeWorkspace(db, w, me!.id);
    },
  ],
  [
    'DELETE',
    '/me/invites/:id',
    ({ db, me, params }) => {
      const inv = myPendingInvites(db, me!.email).find((i) => i.id === params.id);
      if (!inv) throw notFound();
      db.invites = db.invites.filter((i) => i.id !== inv.id);
      return { status: 204 };
    },
  ],
];
