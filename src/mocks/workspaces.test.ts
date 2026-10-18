import { describe, expect, it } from 'vitest';
import type { Me, Workspace } from '@/api/types';
import { handleMockRequest } from './backend';
import { createSeedDb, type MockDb } from './db';

// SPEC §12 behaviours of the mock backend (the FE's contract stand-in while the BE is built).
const call = (db: MockDb, method: string, path: string, body?: unknown, ws?: string | null) =>
  handleMockRequest(db, method, path, new URLSearchParams(), body, { workspaceId: ws ?? null });
const as = (db: MockDb, email: string) => {
  db.sessionUserId = db.users.find((u) => u.email === email)!.id;
};
const wsId = (db: MockDb, name: string) => db.workspaces.find((w) => w.name === name)!.id;
const names = (res: { body?: unknown }) => ((res.body as { data: { name?: string; title?: string }[] }).data).map((x) => x.name ?? x.title);

describe('workspaces (mock, SPEC §12)', () => {
  it('returns Me with the current workspace and all memberships by name', () => {
    const db = createSeedDb();
    as(db, 'alice@example.com');
    const me = call(db, 'GET', '/auth/me').body as Me;
    expect(me.currentWorkspace?.name).toBe('Mekari');
    expect(me.workspaces.map((w) => [w.name, w.myRole])).toEqual([
      ['Acme Pilot', 'ADMIN'],
      ['Mekari', 'MEMBER'],
    ]);
    const inAcme = call(db, 'GET', '/auth/me', undefined, wsId(db, 'Acme Pilot')).body as Me;
    expect(inAcme).toMatchObject({ role: 'ADMIN', currentWorkspace: { name: 'Acme Pilot' } });
  });

  it('scopes lists by X-Workspace-Id and 404s a workspace the caller is not in', () => {
    const db = createSeedDb();
    as(db, 'alice@example.com');
    expect(names(call(db, 'GET', '/projects', undefined, wsId(db, 'Acme Pilot')))).toEqual(['Pilot Rollout', 'Pilot internal notes']);
    expect(names(call(db, 'GET', '/projects'))).toContain('Website Redesign');
    as(db, 'carol@example.com');
    expect(call(db, 'GET', '/projects', undefined, wsId(db, 'Acme Pilot')).status).toBe(404);
  });

  it('ID-addressed endpoints ignore the header and report workspaceId', () => {
    const db = createSeedDb();
    as(db, 'bob@example.com');
    const sso = db.tasks.find((t) => t.title === 'Configure SSO')!;
    const res = call(db, 'GET', `/tasks/${sso.id}`, undefined, wsId(db, 'Mekari'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ workspaceId: wsId(db, 'Acme Pilot') });
    as(db, 'carol@example.com');
    expect(call(db, 'GET', `/tasks/${sso.id}`).status).toBe(404);
  });

  it('answers 403 NO_WORKSPACE when the user has none', () => {
    const db = createSeedDb();
    as(db, 'carol@example.com');
    expect(call(db, 'POST', `/workspaces/${wsId(db, 'Mekari')}/leave`).status).toBe(204);
    expect(call(db, 'GET', '/projects').body).toMatchObject({
      error: { code: 'FORBIDDEN', details: [{ path: ['workspace'], message: 'NO_WORKSPACE' }] },
    });
    expect((call(db, 'GET', '/auth/me').body as Me).currentWorkspace).toBeNull();
  });

  it('applies the guest rules', () => {
    const db = createSeedDb();
    as(db, 'guest@partner.test');
    expect(names(call(db, 'GET', '/projects'))).toEqual(['Pilot Rollout']);
    expect(call(db, 'GET', '/goals').body).toEqual({ data: [] });
    expect(call(db, 'POST', '/projects', { name: 'x', teamId: db.teams[0].id }).status).toBe(403);
    expect(call(db, 'POST', '/teams', { name: 'x' }).status).toBe(403);
    expect(call(db, 'GET', '/reports/workload').status).toBe(403);
    // Only people sharing a project: alice (owner), bob (editor), and the guest.
    expect(names(call(db, 'GET', '/users')).sort()).toEqual(['Alice Anderson', 'Bob Brown', 'Gina Guest']);
    as(db, 'alice@example.com');
    const team = db.teams.find((t) => t.name === 'Pilot Team')!;
    const guest = db.users.find((u) => u.email === 'guest@partner.test')!;
    expect(call(db, 'POST', `/teams/${team.id}/members`, { userId: guest.id }).status).toBe(400);
  });

  it('rejects cross-workspace references', () => {
    const db = createSeedDb();
    as(db, 'admin@example.com');
    const task = db.tasks.find((t) => t.title === 'Collect customer logos')!;
    const guest = db.users.find((u) => u.email === 'guest@partner.test')!;
    expect(call(db, 'PATCH', `/tasks/${task.id}`, { assigneeId: guest.id }).body).toMatchObject({
      error: { code: 'VALIDATION', details: [{ path: ['assigneeId'] }] },
    });
  });

  it('forces external invites in an organization to GUEST and blocks duplicates', () => {
    const db = createSeedDb();
    as(db, 'admin@example.com');
    expect(call(db, 'POST', '/admin/invites', { email: 'x@other.test', role: 'MEMBER' }).body).toMatchObject({
      error: { code: 'VALIDATION', details: [{ path: ['role'], message: 'External people can only be guests' }] },
    });
    expect(call(db, 'POST', '/admin/invites', { email: 'x@other.test', role: 'GUEST' }).status).toBe(201);
    expect(call(db, 'POST', '/admin/invites', { email: 'x@other.test', role: 'GUEST' }).status).toBe(409);
    expect(call(db, 'POST', '/admin/invites', { email: 'bob@example.com', role: 'MEMBER' }).status).toBe(409);
  });

  it('converts to an organization and reports who became a guest', () => {
    const db = createSeedDb();
    as(db, 'alice@example.com');
    const acme = wsId(db, 'Acme Pilot');
    expect(call(db, 'PATCH', `/workspaces/${acme}`, { isOrganization: true, domain: 'acme.test' }).status).toBe(400);
    expect(call(db, 'PATCH', `/workspaces/${acme}`, { isOrganization: true, domain: 'example.com' }).status).toBe(409);
    db.workspaces.find((w) => w.name === 'Mekari')!.domain = 'mekari.test';
    const res = call(db, 'PATCH', `/workspaces/${acme}`, { isOrganization: true, domain: 'example.com' });
    // bob stays MEMBER (on-domain); the guest already was one.
    expect(res.body).toMatchObject({ isOrganization: true, domain: 'example.com', convertedToGuests: 0 });
    db.users.find((u) => u.email === 'bob@example.com')!.email = 'bob@elsewhere.test';
    const res2 = call(db, 'PATCH', `/workspaces/${acme}`, { domain: 'example.com' });
    expect(res2.body).toMatchObject({ convertedToGuests: 1 });
  });

  it('keeps the last admin and passes project ownership on deactivation', () => {
    const db = createSeedDb();
    as(db, 'alice@example.com');
    const acme = wsId(db, 'Acme Pilot');
    const alice = db.users.find((u) => u.email === 'alice@example.com')!;
    const bob = db.users.find((u) => u.email === 'bob@example.com')!;
    expect(call(db, 'POST', `/workspaces/${acme}/leave`).status).toBe(409);
    expect(call(db, 'PATCH', `/admin/users/${alice.id}`, { role: 'MEMBER' }, acme).status).toBe(409);
    const notes = db.projects.find((p) => p.name === 'Pilot internal notes')!;
    expect(call(db, 'PATCH', `/admin/users/${bob.id}`, { isActive: false }, acme).body).toMatchObject({ isActive: false });
    expect(db.projectMembers.find((m) => m.projectId === notes.id && m.role === 'OWNER')!.userId).toBe(alice.id);
  });

  it('joins a matching organization and accepts / declines invites', () => {
    const db = createSeedDb();
    as(db, 'carol@example.com');
    const mekari = wsId(db, 'Mekari');
    call(db, 'POST', `/workspaces/${mekari}/leave`);
    expect(call(db, 'GET', '/workspaces/joinable').body).toEqual({ data: [expect.objectContaining({ name: 'Mekari', memberCount: 3 })] });
    expect(call(db, 'POST', `/workspaces/${mekari}/join`).status).toBe(201);
    expect(call(db, 'GET', '/workspaces/joinable').body).toEqual({ data: [] });

    as(db, 'alice@example.com');
    const acme = wsId(db, 'Acme Pilot');
    call(db, 'POST', '/admin/invites', { email: 'carol@example.com', role: 'MEMBER' }, acme);
    as(db, 'carol@example.com');
    const [inv] = (call(db, 'GET', '/me/invites').body as { data: { id: string; workspace: { name: string } }[] }).data;
    expect(inv.workspace.name).toBe('Acme Pilot');
    expect((call(db, 'POST', `/me/invites/${inv.id}/accept`).body as Workspace).myRole).toBe('MEMBER');
    expect(call(db, 'GET', '/me/invites').body).toEqual({ data: [] });
  });

  it('creates, switches and deletes (by typing the name)', () => {
    const db = createSeedDb();
    as(db, 'bob@example.com');
    const created = call(db, 'POST', '/workspaces', { name: 'Side project', color: '#4573d2' });
    expect(created).toMatchObject({ status: 201, body: { name: 'Side project', myRole: 'ADMIN', memberCount: 1 } });
    const id = (created.body as Workspace).id;
    expect((call(db, 'GET', '/auth/me').body as Me).currentWorkspace?.id).toBe(id);
    expect(call(db, 'POST', `/workspaces/${wsId(db, 'Mekari')}/switch`).status).toBe(200);
    expect((call(db, 'GET', '/auth/me').body as Me).currentWorkspace?.name).toBe('Mekari');
    expect(call(db, 'DELETE', `/workspaces/${id}`, { confirmName: 'nope' }).status).toBe(400);
    expect(call(db, 'DELETE', `/workspaces/${id}`, { confirmName: 'Side project' }).status).toBe(204);
  });
});

describe('workspace clarifications W1–W8 (mock)', () => {
  const GUEST = 'guest@partner.test';
  const id = (db: MockDb, email: string) => db.users.find((u) => u.email === email)!.id;
  const err = (res: { body?: unknown }) => (res.body as { error: { code: string; details?: { path: string[] }[] } }).error;

  it('W1: guests get no teams and 404 on a team', () => {
    const db = createSeedDb();
    as(db, GUEST);
    const acme = wsId(db, 'Acme Pilot');
    expect(call(db, 'GET', '/teams', undefined, acme).body).toEqual({ data: [] });
    const team = db.teams.find((t) => t.workspaceId === acme)!;
    expect(call(db, 'GET', `/teams/${team.id}`, undefined, acme).status).toBe(404);
  });

  it('W2: a guest cannot own a goal', () => {
    const db = createSeedDb();
    as(db, 'alice@example.com');
    const acme = wsId(db, 'Acme Pilot');
    const res = call(db, 'POST', '/goals', { title: 'Pilot NPS', timePeriod: '2026-Q4', isCompany: true, ownerId: id(db, GUEST) }, acme);
    expect(res.status).toBe(400);
    expect(err(res).details?.[0].path).toEqual(['ownerId']);
  });

  it('W3: a deactivated member cannot rejoin the org through its domain', () => {
    const db = createSeedDb();
    const mekari = wsId(db, 'Mekari');
    db.workspaceMembers.find((m) => m.workspaceId === mekari && m.userId === id(db, 'bob@example.com'))!.isActive = false;
    as(db, 'bob@example.com');
    expect(names(call(db, 'GET', '/workspaces/joinable'))).toEqual([]);
    expect(call(db, 'POST', `/workspaces/${mekari}/join`).status).toBe(403);
  });

  it('W6: accepting an invite while already a member keeps the role', () => {
    const db = createSeedDb();
    const acme = wsId(db, 'Acme Pilot');
    db.invites.push({ id: 'inv-b', workspaceId: acme, email: 'bob@example.com', role: 'GUEST', token: 't', invitedById: id(db, 'alice@example.com'), expiresAt: new Date(Date.now() + 864e5).toISOString(), acceptedAt: null, createdAt: new Date().toISOString() });
    as(db, 'bob@example.com');
    expect(call(db, 'POST', '/me/invites/inv-b/accept').status).toBe(200);
    expect(db.workspaceMembers.find((m) => m.workspaceId === acme && m.userId === id(db, 'bob@example.com'))!.role).toBe('MEMBER');
    expect((call(db, 'GET', '/me/invites').body as { data: unknown[] }).data).toEqual([]);
  });

  it('W7: a guest cannot be made project OWNER, and finds only co-members by id', () => {
    const db = createSeedDb();
    const acme = wsId(db, 'Acme Pilot');
    const rollout = db.projects.find((p) => p.name === 'Pilot Rollout')!;
    as(db, 'alice@example.com');
    const res = call(db, 'PATCH', `/projects/${rollout.id}/members/${id(db, GUEST)}`, { role: 'OWNER' }, acme);
    expect(res.status).toBe(400);
    expect(err(res).details?.[0].path).toEqual(['role']);

    as(db, GUEST);
    expect(call(db, 'GET', `/users/${id(db, 'bob@example.com')}`, undefined, acme).status).toBe(200); // on Pilot Rollout
    expect(call(db, 'GET', `/users/${id(db, 'carol@example.com')}`, undefined, acme).status).toBe(404);
  });

  it('W8: /users items carry the role in the current workspace', () => {
    const db = createSeedDb();
    as(db, 'alice@example.com');
    const users = (call(db, 'GET', '/users', undefined, wsId(db, 'Acme Pilot')).body as { data: { email: string; role: string }[] }).data;
    expect(Object.fromEntries(users.map((u) => [u.email, u.role]))).toEqual({ 'alice@example.com': 'ADMIN', 'bob@example.com': 'MEMBER', [GUEST]: 'GUEST' });
  });
});
