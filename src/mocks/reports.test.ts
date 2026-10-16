import { describe, expect, it } from 'vitest';
import type { OverviewReport, ProjectReport, WorkloadReport } from '@/api/types';
import { createMockFetch, handleMockRequest } from './backend';
import { createSeedDb, type MockDb } from './db';

const call = (db: MockDb, method: string, path: string, query = '') => handleMockRequest(db, method, path, new URLSearchParams(query), undefined);
const loginAs = (db: MockDb, email: string) => {
  db.sessionUserId = db.users.find((u) => u.email === email)!.id;
};
const project = (db: MockDb, name = 'Website Redesign') => db.projects.find((p) => p.name === name)!;

describe('mock reports', () => {
  it('builds a project report per SPEC §11', () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    const p = project(db);
    const r = call(db, 'GET', `/projects/${p.id}/report`, 'weeks=8').body as ProjectReport;
    const all = db.tasks.filter((t) => t.projectId === p.id);
    expect(r.totals.total).toBe(all.length); // incl. subtasks
    expect(r.totals.completed + r.totals.incomplete).toBe(r.totals.total);
    expect(r.byPriority.map((x) => x.priority)).toEqual(['HIGH', 'MEDIUM', 'LOW', 'NONE']);
    expect(r.bySection.map((s) => s.name)).toEqual(['To do', 'In progress', 'Done', 'No section']);
    // subtasks of "Draft new homepage copy" (To do) count under To do
    const todoTop = all.filter((t) => !t.parentId && t.sectionId === db.sections.find((s) => s.projectId === p.id && s.name === 'To do')!.id);
    const todoSubs = all.filter((t) => t.parentId && todoTop.some((x) => x.id === t.parentId));
    expect(r.bySection[0].total).toBe(todoTop.length + todoSubs.length);
    expect(r.trend).toHaveLength(8);
    expect(new Date(r.trend[0].weekStart + 'T00:00').getDay()).toBe(1); // Monday
    expect(r.upcoming.every((t) => !t.completed && t.dueDate)).toBe(true);
    expect(r.byAssignee.map((a) => a.incomplete)).toEqual([...r.byAssignee.map((a) => a.incomplete)].sort((a, b) => b - a));
    expect(call(db, 'GET', `/projects/${p.id}/report`, 'weeks=60').status).toBe(400);
  });

  it('exports CSV with BOM, CRLF, subtasks after parents and a formula-injection guard', async () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    const p = project(db);
    db.tasks.find((t) => t.title === 'Pick a font pairing')!.title = '=HYPERLINK("x")';
    const res = await createMockFetch(() => db)(`/api/v1/projects/${p.id}/tasks.csv`);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="website-redesign-tasks.csv"');
    const text = await res.text();
    // Response#text() strips a leading BOM, so check the raw bytes for EF BB BF.
    const bytes = new Uint8Array(await (await createMockFetch(() => db)(`/api/v1/projects/${p.id}/tasks.csv`)).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = text.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toBe('id,title,section,parent_task_id,assignee_name,assignee_email,priority,start_date,due_date,completed,completed_at,created_at');
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
    const parentIdx = lines.findIndex((l) => l.includes('Draft new homepage copy'));
    expect(lines[parentIdx + 1]).toContain('Write launch checklist');
    expect(lines[parentIdx + 1].split(',')[2]).toBe('To do');
  });

  it('builds the overview for visible, non-archived projects', () => {
    const db = createSeedDb();
    loginAs(db, 'bob@example.com');
    project(db, 'API v2').archived = true;
    const o = call(db, 'GET', '/reports/overview').body as OverviewReport;
    expect(o.projects.map((p) => p.project.name)).toEqual(['Q4 Launch Campaign', 'Website Redesign']);
    expect(o.totals.projects).toBe(2);
    expect(o.projects[1].lastActivityAt).not.toBeNull();
  });

  it('computes workload with range validation and caller visibility', () => {
    const db = createSeedDb();
    loginAs(db, 'admin@example.com');
    const w = call(db, 'GET', '/reports/workload', 'from=2026-01-01&to=2026-12-31');
    expect(w.status).toBe(400); // > 92 days
    const ok = call(db, 'GET', '/reports/workload').body as WorkloadReport;
    expect(ok.data.map((d) => d.open)).toEqual([...ok.data.map((d) => d.open)].sort((a, b) => b - a));
    const adminRow = ok.data.find((d) => d.user.email === 'admin@example.com')!;
    expect(adminRow.open).toBe(db.tasks.filter((t) => t.assigneeId === adminRow.user.id && !t.completed).length);

    // bob can't see admin's personal tasks → they don't count for him
    loginAs(db, 'bob@example.com');
    const asBob = call(db, 'GET', '/reports/workload').body as WorkloadReport;
    expect(asBob.data.find((d) => d.user.email === 'admin@example.com')!.open).toBeLessThan(adminRow.open);
  });
});
