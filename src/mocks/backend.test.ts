import { describe, expect, it } from 'vitest';
import { handleMockRequest } from './backend';
import { createSeedDb, type MockDb } from './db';

const call = (db: MockDb, method: string, path: string, body?: unknown, query = '') =>
  handleMockRequest(db, method, path, new URLSearchParams(query), body);
const loginAs = (db: MockDb, email: string) => {
  db.sessionUserId = db.users.find((u) => u.email === email)!.id;
};

describe('mock backend', () => {
  it('rejects unauthenticated requests with 401 error envelope', () => {
    const db = createSeedDb();
    const res = call(db, 'GET', '/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
  });

  it('logs in with seed credentials and returns a User', () => {
    const db = createSeedDb();
    const res = call(db, 'POST', '/auth/login', { email: 'ADMIN@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'admin@example.com', role: 'ADMIN', isActive: true });
    expect(call(db, 'GET', '/auth/me').status).toBe(200);
  });

  it('hides TEAM projects from non-members with 404', () => {
    const db = createSeedDb();
    loginAs(db, 'bob@example.com'); // Engineering only
    const projects = (call(db, 'GET', '/projects').body as { data: { name: string; id: string }[] }).data;
    const names = projects.map((p) => p.name);
    expect(names).toContain('Website Redesign');
    expect(names).toContain('Q4 Launch Campaign'); // PUBLIC
    const mkt = db.projects.find((p) => p.name === 'Q4 Launch Campaign')!;
    mkt.privacy = 'TEAM';
    expect(call(db, 'GET', `/projects/${mkt.id}`).status).toBe(404);
  });

  it('returns project tasks top-level only, ordered by section then position', () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    const tasks = (call(db, 'GET', `/projects/${p.id}/tasks`).body as { data: { parentId: string | null; sectionId: string | null }[] }).data;
    expect(tasks.every((t) => t.parentId === null)).toBe(true);
    expect(tasks[0].sectionId).toBeNull(); // unsectioned first
  });

  it('assigning a task notifies the assignee and records activity', () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    const bob = db.users.find((u) => u.email === 'bob@example.com')!;
    const task = db.tasks.find((t) => t.title === 'Collect customer logos')!;
    const res = call(db, 'PATCH', `/tasks/${task.id}`, { assigneeId: bob.id, dueDate: '2030-01-02' });
    expect(res.status).toBe(200);
    expect(db.notifications.some((n) => n.userId === bob.id && n.type === 'ASSIGNED' && n.taskId === task.id)).toBe(true);
    const types = db.activities.filter((a) => a.taskId === task.id).map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(['ASSIGNED', 'DUE_DATE_CHANGED']));
  });

  it('validates date-only strings', () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    const task = db.tasks[0];
    expect(call(db, 'PATCH', `/tasks/${task.id}`, { dueDate: '2030-1-2' }).status).toBe(400);
  });

  it('comment mentions create MENTIONED notifications', () => {
    const db = createSeedDb();
    loginAs(db, 'bob@example.com');
    const alice = db.users.find((u) => u.email === 'alice@example.com')!;
    const task = db.tasks.find((t) => t.title === 'Pick a font pairing')!;
    const res = call(db, 'POST', `/tasks/${task.id}/comments`, { body: `hey @[Alice](${alice.id})` });
    expect(res.status).toBe(201);
    expect(db.notifications.some((n) => n.userId === alice.id && n.type === 'MENTIONED')).toBe(true);
  });

  it('invite → accept flow creates a user and session', () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    const inv = call(db, 'POST', '/admin/invites', { email: 'new@example.com', role: 'MEMBER' }).body as { token: string };
    db.sessionUserId = null;
    expect(call(db, 'GET', `/auth/invites/${inv.token}`).body).toEqual({ email: 'new@example.com', role: 'MEMBER' });
    const res = call(db, 'POST', '/auth/accept-invite', { token: inv.token, name: 'New Person', password: 'longenough' });
    expect(res.status).toBe(200);
    expect(call(db, 'GET', `/auth/invites/${inv.token}`).status).toBe(404);
  });

  it('members cannot use admin endpoints', () => {
    const db = createSeedDb();
    loginAs(db, 'alice@example.com');
    expect(call(db, 'GET', '/admin/users').status).toBe(403);
  });
});
