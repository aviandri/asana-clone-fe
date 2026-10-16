import { describe, expect, it } from 'vitest';
import type { GoalDetail, KeyResult } from '@/api/types';
import { handleMockRequest } from './backend';
import { createSeedDb, type MockDb } from './db';
import { krProgress } from './goals';

const call = (db: MockDb, method: string, path: string, body?: unknown, query = '') =>
  handleMockRequest(db, method, path, new URLSearchParams(query), body);
const loginAs = (db: MockDb, email: string) => {
  db.sessionUserId = db.users.find((u) => u.email === email)!.id;
};
const goalId = (db: MockDb, title: string) => db.goals!.find((g) => g.title === title)!.id;

describe('mock goals', () => {
  it('computes KR progress, including decreasing targets and equal start/target', () => {
    expect(krProgress({ startValue: 0, targetValue: 40, currentValue: 10 })).toBe(25);
    expect(krProgress({ startValue: 2400, targetValue: 1200, currentValue: 2000 })).toBe(33.3);
    expect(krProgress({ startValue: 0, targetValue: 10, currentValue: 50 })).toBe(100);
    expect(krProgress({ startValue: 5, targetValue: 5, currentValue: 5 })).toBe(100);
    expect(krProgress({ startValue: 5, targetValue: 5, currentValue: 4 })).toBe(0);
  });

  it('rolls progress up KEY_RESULTS → SUB_GOALS (weighted) and PROJECTS', () => {
    const db = createSeedDb();
    loginAs(db, 'alice@example.com');
    const get = (t: string) => call(db, 'GET', `/goals/${goalId(db, t)}`).body as GoalDetail;
    const perf = get('Make the app fast'); // (33.33 + 40) / 2
    expect(perf.progress).toBe(36.7);
    const web = get('Launch the redesigned website'); // Website Redesign: 3 of 13 tasks done
    const tasks = db.tasks.filter((t) => t.projectId === db.projects.find((p) => p.name === 'Website Redesign')!.id);
    expect(web.progress).toBeCloseTo(Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 1000) / 10, 5);
    expect(web.projects[0]).toMatchObject({ project: { name: 'Website Redesign' }, total: tasks.length });
    const eng = get('Ship a delightful v1.1');
    expect(eng.children.map((c) => c.title)).toEqual(['Launch the redesigned website', 'Make the app fast', 'Publish API docs']);
    expect(eng.canEdit).toBe(true); // alice owns it
  });

  it('enforces create permissions per level', () => {
    const db = createSeedDb();
    loginAs(db, 'bob@example.com');
    const mkt = db.teams.find((t) => t.name === 'Marketing')!.id;
    const eng = db.teams.find((t) => t.name === 'Engineering')!.id;
    expect(call(db, 'POST', '/goals', { title: 'x', timePeriod: '2026-Q4', isCompany: true }).status).toBe(403);
    expect(call(db, 'POST', '/goals', { title: 'x', timePeriod: '2026-Q4', teamId: mkt }).status).toBe(403);
    expect(call(db, 'POST', '/goals', { title: 'x', timePeriod: '2026-Q4', teamId: eng }).status).toBe(201);
    expect(call(db, 'POST', '/goals', { title: 'x', timePeriod: '2026-Q5' }).status).toBe(400);
    expect(call(db, 'POST', '/goals', { title: 'x', timePeriod: '2026', isCompany: true, teamId: eng }).status).toBe(400);
  });

  it('rejects cycles and self-parenting with 400 on parentId', () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    const company = goalId(db, 'Become the go-to tool for internal planning');
    const leaf = goalId(db, 'Make the app fast');
    const res = call(db, 'PATCH', `/goals/${company}`, { parentId: leaf });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('parentId');
    expect(call(db, 'PATCH', `/goals/${leaf}`, { parentId: leaf }).status).toBe(400);
  });

  it('limits depth to 6', () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    let parent = goalId(db, 'Make the app fast'); // depth 3
    for (let i = 0; i < 3; i++) {
      const r = call(db, 'POST', '/goals', { title: `d${i}`, timePeriod: '2026-Q4', parentId: parent });
      expect(r.status).toBe(201);
      parent = (r.body as GoalDetail).id;
    }
    expect(call(db, 'POST', '/goals', { title: 'too deep', timePeriod: '2026-Q4', parentId: parent }).status).toBe(400);
  });

  it('lets a KR owner update only currentValue; BOOLEAN takes 0/1', () => {
    const db = createSeedDb();
    loginAs(db, 'bob@example.com'); // not in Marketing, owns nothing there
    const wau = db.keyResults!.find((k) => k.title === 'Weekly active users')!;
    expect(call(db, 'PATCH', `/key-results/${wau.id}`, { currentValue: 50 }).status).toBe(403);
    wau.ownerId = db.users.find((u) => u.email === 'bob@example.com')!.id;
    expect((call(db, 'PATCH', `/key-results/${wau.id}`, { currentValue: 50 }).body as KeyResult).progress).toBe(50);
    expect(call(db, 'PATCH', `/key-results/${wau.id}`, { title: 'x' }).status).toBe(403);
    loginAs(db, 'alice@example.com');
    const live = db.keyResults!.find((k) => k.title === 'Docs site live')!;
    expect(call(db, 'PATCH', `/key-results/${live.id}`, { currentValue: 0.5 }).status).toBe(400);
    expect((call(db, 'PATCH', `/key-results/${live.id}`, { currentValue: 1 }).body as KeyResult).progress).toBe(100);
  });

  it('posting a status update sets the goal status and snapshots progress', () => {
    const db = createSeedDb();
    loginAs(db, 'bob@example.com');
    const perf = goalId(db, 'Make the app fast');
    const res = call(db, 'POST', `/goals/${perf}/updates`, { status: 'AT_RISK', body: 'better' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'AT_RISK', progress: 36.7, body: 'better' });
    const list = (call(db, 'GET', `/goals/${perf}/updates`).body as { data: { body: string }[] }).data;
    expect(list[0].body).toBe('better');
    expect((call(db, 'GET', `/goals/${perf}`).body as GoalDetail).status).toBe('AT_RISK');
  });

  it('deleting a goal orphans its children', () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    const eng = goalId(db, 'Ship a delightful v1.1');
    expect(call(db, 'DELETE', `/goals/${eng}`).status).toBe(204);
    expect(db.goals!.find((g) => g.title === 'Make the app fast')!.parentId).toBeNull();
  });

  it('lists time periods newest year first with the current quarter', () => {
    const db = createSeedDb();
    loginAs(db, 'alice@example.com');
    const periods = (call(db, 'GET', '/goals/time-periods').body as { data: string[] }).data;
    const now = new Date();
    expect(periods).toContain(`${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`);
    expect(periods[0]).toBe(String(now.getFullYear()));
  });
});
