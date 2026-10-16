#!/usr/bin/env node
// FE ↔ BE contract smoke test.
//
// Exercises every endpoint the frontend uses against a running backend, the way the FE calls
// them, and checks each response field-by-field against the SPEC §5 shapes mirrored in
// src/api/types.ts (missing/wrong-typed fields fail; extra fields are reported as info).
// It also asserts the key behaviours the UI relies on (201 creates, 403/404/409 rules, COMMENTER
// role, subtasks, stories order, notifications, search, invites, cascades).
//
// Usage:
//   BASE_URL=http://localhost:3000 node scripts/contract-smoke.mjs      (or: npm run test:contract)
//
// Env:
//   BASE_URL        backend origin (default http://127.0.0.1:3000); the API is at $BASE_URL/api/v1
//   ADMIN_EMAIL     default admin@example.com   ┐
//   ALICE_EMAIL     default alice@example.com   │ seed users (SPEC §7) — must exist and be active,
//   BOB_EMAIL       default bob@example.com     │ admin must be ADMIN, alice/bob MEMBER
//   SEED_PASSWORD   default password123         ┘
//
// Data: everything it creates lives in a "[fe-smoke]" team + project (PRIVATE), deleted at the end
// (also on failure). It marks at most one of alice's smoke notifications as read and does not call
// read-all. Requires Node 20+ (global fetch, Headers#getSetCookie). Exit code 1 on any failure.
// Note: it performs 4 logins; keep AUTH_RATE_LIMIT_MAX ≥ 5/min for the test IP.

const ORIGIN = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
const BASE = `${ORIGIN}/api/v1`;
const PASSWORD = process.env.SEED_PASSWORD ?? 'password123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ALICE_EMAIL = process.env.ALICE_EMAIL ?? 'alice@example.com';
const BOB_EMAIL = process.env.BOB_EMAIL ?? 'bob@example.com';
const PREFIX = '[fe-smoke]';

// ---------- tiny schema checker ----------
const S = 'string', N = 'number', B = 'boolean';
const nul = (t) => ({ nullable: t });
const opt = (t) => ({ optional: t });
const arr = (t) => ({ array: t });
const oneOf = (...vals) => ({ enum: vals });
const any = { any: true };

const UserSummary = { id: S, name: S, email: S, avatarColor: S };
const User = { ...UserSummary, role: oneOf('ADMIN', 'MEMBER'), isActive: B, createdAt: S };
const Team = { id: S, name: S, description: nul(S), memberCount: N, createdAt: S };
const TeamDetail = { ...Team, members: arr(UserSummary) };
const Section = { id: S, projectId: S, name: S, position: N };
const Project = {
  id: S, teamId: S, name: S, description: nul(S), color: S,
  privacy: oneOf('PUBLIC', 'TEAM', 'PRIVATE'), archived: B, defaultView: oneOf('LIST', 'BOARD', 'CALENDAR'),
  owner: UserSummary, createdAt: S, updatedAt: S, myRole: nul(oneOf('OWNER', 'EDITOR', 'COMMENTER')),
};
const ProjectDetail = {
  ...Project, sections: arr(Section),
  members: arr({ user: UserSummary, role: oneOf('OWNER', 'EDITOR', 'COMMENTER') }),
  team: { id: S, name: S },
};
const Task = {
  id: S, projectId: nul(S), sectionId: nul(S), parentId: nul(S), title: S, description: nul(S),
  assignee: nul(UserSummary), creator: UserSummary, dueDate: nul(S), startDate: nul(S),
  priority: oneOf('NONE', 'LOW', 'MEDIUM', 'HIGH'), completed: B, completedAt: nul(S), position: N,
  subtaskCount: N, completedSubtaskCount: N, commentCount: N,
  project: nul({ id: S, name: S, color: S }), createdAt: S, updatedAt: S,
};
const TaskDetail = { ...Task, followers: arr(UserSummary), subtasks: arr(Task), parent: nul({ id: S, title: S }) };
const CommentStory = { kind: oneOf('comment'), id: S, author: UserSummary, body: S, createdAt: S, editedAt: nul(S) };
const ActivityStory = { kind: oneOf('activity'), id: S, actor: UserSummary, type: S, data: any, createdAt: S };
const Story = { union: [CommentStory, ActivityStory], tag: 'kind' };
const Notification = {
  id: S, type: oneOf('ASSIGNED', 'COMMENTED', 'COMPLETED', 'MENTIONED'), read: B, createdAt: S,
  actor: UserSummary, task: nul({ id: S, title: S, projectId: nul(S) }),
};
const Invite = {
  id: S, email: S, role: oneOf('ADMIN', 'MEMBER'), token: S, inviteUrl: S, expiresAt: S, createdAt: S,
  invitedBy: opt(UserSummary),
};
const ErrorBody = { error: { code: oneOf('NOT_FOUND', 'VALIDATION', 'UNAUTHORIZED', 'FORBIDDEN', 'CONFLICT', 'GONE', 'RATE_LIMITED', 'INTERNAL'), message: S, details: opt(any) } };
const List = (t) => ({ data: arr(t) });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function check(value, schema, path = '$', out = []) {
  if (schema === any) return out;
  if (schema && typeof schema === 'object' && 'optional' in schema) {
    if (value === undefined) return out;
    return check(value, schema.optional, path, out);
  }
  if (value === undefined) { out.push(`${path}: missing`); return out; }
  if (schema && typeof schema === 'object' && 'nullable' in schema) {
    if (value === null) return out;
    return check(value, schema.nullable, path, out);
  }
  if (value === null) { out.push(`${path}: null (expected non-null)`); return out; }
  if (typeof schema === 'string') {
    if (typeof value !== schema) out.push(`${path}: ${typeof value} (expected ${schema})`);
    else if (schema === S && /(At|^createdAt)$/.test(path.split('.').pop()) && !ISO_RE.test(value)) out.push(`${path}: "${value}" not ISO-8601 UTC`);
    else if (schema === S && /(dueDate|startDate)$/.test(path) && !DATE_RE.test(value)) out.push(`${path}: "${value}" not YYYY-MM-DD`);
    return out;
  }
  if ('enum' in schema) { if (!schema.enum.includes(value)) out.push(`${path}: ${JSON.stringify(value)} not in ${schema.enum.join('|')}`); return out; }
  if ('array' in schema) {
    if (!Array.isArray(value)) { out.push(`${path}: not an array`); return out; }
    value.slice(0, 5).forEach((v, i) => check(v, schema.array, `${path}[${i}]`, out));
    return out;
  }
  if ('union' in schema) {
    const variant = schema.union.find((v) => v[schema.tag]?.enum?.includes(value?.[schema.tag]));
    if (!variant) { out.push(`${path}.${schema.tag}: ${JSON.stringify(value?.[schema.tag])} unknown`); return out; }
    return check(value, variant, path, out);
  }
  if (typeof value !== 'object' || Array.isArray(value)) { out.push(`${path}: not an object`); return out; }
  for (const [k, sub] of Object.entries(schema)) check(value[k], sub, `${path}.${k}`, out);
  for (const k of Object.keys(value)) if (!(k in schema)) out.push(`${path}.${k}: extra field (info)`);
  return out;
}

// ---------- http with cookie jar per user ----------
function client(label) {
  let cookie = '';
  return async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(cookie && { cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(';');
      if (pair.startsWith('sid=')) cookie = pair.endsWith('=') ? '' : pair;
    }
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
    return { status: res.status, body: json, label };
  };
}

const results = [];
function expect(name, res, status, schema) {
  const problems = [];
  const okStatus = Array.isArray(status) ? status.includes(res.status) : res.status === status;
  if (!okStatus) problems.push(`status ${res.status} (expected ${status}) body=${JSON.stringify(res.body)?.slice(0, 300)}`);
  else if (schema) problems.push(...check(res.body, schema));
  const errors = problems.filter((p) => !p.endsWith('(info)'));
  results.push({ name, ok: errors.length === 0, problems });
  return res.body;
}

const admin = client('admin');
const alice = client('alice');
const bob = client('bob');
const today = new Date().toISOString().slice(0, 10);
let teamId, projectId;

try {
  expect('GET /health (root)', await fetch(`${ORIGIN}/health`).then(async (r) => ({ status: r.status, body: await r.json() })), 200, { ok: B });
  expect('GET /auth/me unauthenticated → 401', await admin('GET', '/auth/me'), 401, ErrorBody);
  expect('POST /auth/login bad creds → 401', await admin('POST', '/auth/login', { email: ADMIN_EMAIL, password: `${PASSWORD}-wrong` }), 401, ErrorBody);
  const me = expect('POST /auth/login', await admin('POST', '/auth/login', { email: ADMIN_EMAIL.toUpperCase(), password: PASSWORD }), 200, User);
  const aliceUser = expect('POST /auth/login (alice)', await alice('POST', '/auth/login', { email: ALICE_EMAIL, password: PASSWORD }), 200, User);
  const bobUser = expect('POST /auth/login (bob)', await bob('POST', '/auth/login', { email: BOB_EMAIL, password: PASSWORD }), 200, User);
  expect('GET /auth/me', await admin('GET', '/auth/me'), 200, User);

  expect('GET /users', await admin('GET', '/users'), 200, List(UserSummary));
  expect('GET /users?q=ali', await admin('GET', `/users?q=${encodeURIComponent(ALICE_EMAIL.slice(0, 3))}`), 200, List(UserSummary));
  expect('GET /users/:id', await admin('GET', `/users/${aliceUser.id}`), 200, User);

  expect('GET /teams', await admin('GET', '/teams'), 200, List(Team));
  expect('GET /teams?mine=true', await alice('GET', '/teams?mine=true'), 200, List(Team));
  const team = expect('POST /teams', await admin('POST', '/teams', { name: `${PREFIX} team`, description: 'smoke' }), 201, TeamDetail);
  teamId = team.id;
  expect('GET /teams/:id', await admin('GET', `/teams/${teamId}`), 200, TeamDetail);
  expect('PATCH /teams/:id', await admin('PATCH', `/teams/${teamId}`, { description: null }), 200, TeamDetail);
  expect('POST /teams/:id/members', await admin('POST', `/teams/${teamId}/members`, { userId: aliceUser.id }), 200, TeamDetail);

  expect('POST /projects outside team → 403 (bob)', await bob('POST', '/projects', { teamId, name: `${PREFIX} nope` }), 403, ErrorBody);
  const proj = expect('POST /projects', await admin('POST', '/projects', { teamId, name: `${PREFIX} project`, privacy: 'PRIVATE' }), 201, ProjectDetail);
  projectId = proj.id;
  results.push({ name: 'POST /projects default sections', ok: proj.sections?.map((s) => s.name).join(',') === 'To do,In progress,Done', problems: [`sections=${proj.sections?.map((s) => s.name)}`] });
  expect('GET /projects', await admin('GET', '/projects?archived=false'), 200, List(Project));
  expect('GET /projects?teamId=', await admin('GET', `/projects?teamId=${teamId}`), 200, List(Project));
  expect('GET /projects/:id', await admin('GET', `/projects/${projectId}`), 200, ProjectDetail);
  expect('GET private project as bob → 404', await bob('GET', `/projects/${projectId}`), 404, ErrorBody);
  expect('PATCH /projects/:id', await admin('PATCH', `/projects/${projectId}`, { color: '#4573d2', defaultView: 'BOARD', description: 'x' }), 200, ProjectDetail);
  expect('POST /projects/:id/members', await admin('POST', `/projects/${projectId}/members`, { userId: aliceUser.id, role: 'EDITOR' }), 200, ProjectDetail);
  expect('PATCH last OWNER → EDITOR → 409', await admin('PATCH', `/projects/${projectId}/members/${me.id}`, { role: 'EDITOR' }), 409, ErrorBody);
  expect('DELETE last OWNER → 409', await admin('DELETE', `/projects/${projectId}/members/${me.id}`), 409, ErrorBody);
  expect('PATCH /projects/:id/members/:userId', await admin('PATCH', `/projects/${projectId}/members/${aliceUser.id}`, { role: 'COMMENTER' }), 200, ProjectDetail);
  const asCommenter = await alice('GET', `/projects/${projectId}`);
  results.push({ name: 'myRole for COMMENTER', ok: asCommenter.body?.myRole === 'COMMENTER', problems: [`myRole=${asCommenter.body?.myRole}`] });

  const sec = expect('POST /projects/:id/sections', await admin('POST', `/projects/${projectId}/sections`, { name: `${PREFIX} sec` }), 201, Section);
  expect('PATCH /sections/:id', await admin('PATCH', `/sections/${sec.id}`, { name: `${PREFIX} sec2`, position: 99999 }), 200, Section);
  const todo = proj.sections[0];

  const t1 = expect('POST /tasks', await admin('POST', '/tasks', { title: `${PREFIX} task`, projectId, sectionId: todo.id, position: 1000 }), 201, TaskDetail);
  const t2 = expect('POST /tasks (sectionId only → project inferred)', await admin('POST', '/tasks', { title: `${PREFIX} task2`, sectionId: sec.id }), 201, TaskDetail);
  results.push({ name: 'project inferred from section', ok: t2?.projectId === projectId, problems: [`projectId=${t2?.projectId}`] });
  expect('POST /tasks as COMMENTER → 403', await alice('POST', '/tasks', { title: `${PREFIX} nope`, projectId }), 403, ErrorBody);
  const patched = expect('PATCH /tasks/:id', await admin('PATCH', `/tasks/${t1.id}`, { dueDate: today, priority: 'HIGH', description: 'desc', assigneeId: me.id, sectionId: sec.id, position: 500 }), 200, TaskDetail);
  results.push({ name: 'PATCH /tasks persisted fields', ok: patched?.dueDate === today && patched?.sectionId === sec.id && patched?.position === 500, problems: [`dueDate=${patched?.dueDate} sectionId ok=${patched?.sectionId === sec.id} position=${patched?.position}`] });
  expect('PATCH /tasks ignores unknown keys', await admin('PATCH', `/tasks/${t1.id}`, { ...patched, title: `${PREFIX} task renamed` }), 200, TaskDetail);
  expect('PATCH bad dueDate → 400', await admin('PATCH', `/tasks/${t1.id}`, { dueDate: '2030-1-2' }), 400, ErrorBody);
  const badAssign = expect('assign user w/o access → 400', await admin('PATCH', `/tasks/${t1.id}`, { assigneeId: bobUser.id }), 400, ErrorBody);
  results.push({ name: '400 assign error details.assigneeId', ok: !!badAssign?.error?.details && JSON.stringify(badAssign.error.details).includes('assigneeId'), problems: [`details=${JSON.stringify(badAssign?.error?.details)}`] });
  const sub = expect('POST /tasks (subtask)', await admin('POST', '/tasks', { title: `${PREFIX} sub`, parentId: t1.id }), 201, TaskDetail);
  results.push({ name: 'subtask inherits projectId', ok: sub?.projectId === projectId && sub?.parentId === t1.id, problems: [`projectId=${sub?.projectId} parentId=${sub?.parentId}`] });
  expect('POST /tasks sub-subtask (one level) → 400?', await admin('POST', '/tasks', { title: `${PREFIX} subsub`, parentId: sub.id }), [400, 201], undefined);
  const detail = expect('GET /tasks/:id', await admin('GET', `/tasks/${t1.id}`), 200, TaskDetail);
  results.push({ name: 'TaskDetail subtasks + counts', ok: detail?.subtasks?.length >= 1 && detail?.subtaskCount >= 1, problems: [`subtasks=${detail?.subtasks?.length} subtaskCount=${detail?.subtaskCount}`] });
  expect('GET /tasks/:id (subtask parent ref)', await admin('GET', `/tasks/${sub.id}`), 200, TaskDetail);
  const list = expect('GET /projects/:id/tasks', await admin('GET', `/projects/${projectId}/tasks`), 200, List(Task));
  results.push({ name: 'project tasks top-level only', ok: list?.data?.every((t) => t.parentId === null), problems: [] });
  expect('GET /projects/:id/tasks?completed=false', await admin('GET', `/projects/${projectId}/tasks?completed=false`), 200, List(Task));
  expect('GET /me/tasks', await admin('GET', '/me/tasks'), 200, List(Task));
  expect('GET /me/tasks?completed=false', await admin('GET', '/me/tasks?completed=false'), 200, List(Task));

  expect('POST /tasks/:id/followers', await admin('POST', `/tasks/${t1.id}/followers`, { userId: aliceUser.id }), 200, TaskDetail);
  expect('DELETE /tasks/:id/followers/:userId', await admin('DELETE', `/tasks/${t1.id}/followers/${me.id}`), 200, TaskDetail);
  expect('POST /tasks/:id/followers (re-follow)', await admin('POST', `/tasks/${t1.id}/followers`, { userId: me.id }), 200, TaskDetail);

  const c = expect('POST /tasks/:id/comments (+mention)', await admin('POST', `/tasks/${t1.id}/comments`, { body: `${PREFIX} hi @[Alice Anderson](${aliceUser.id})` }), 201, CommentStory);
  expect('POST comment as COMMENTER allowed', await alice('POST', `/tasks/${t1.id}/comments`, { body: `${PREFIX} from alice` }), 201, CommentStory);
  expect('PATCH /comments/:id', await admin('PATCH', `/comments/${c.id}`, { body: `${PREFIX} edited` }), 200, CommentStory);
  expect('PATCH other\'s comment → 403', await alice('PATCH', `/comments/${c.id}`, { body: 'x' }), 403, ErrorBody);
  const stories = expect('GET /tasks/:id/stories', await admin('GET', `/tasks/${t1.id}/stories`), 200, List(Story));
  const kinds = new Set(stories?.data?.map((s) => s.kind));
  const types = [...new Set(stories?.data?.filter((s) => s.kind === 'activity').map((s) => s.type))];
  results.push({ name: 'stories include comments + activity', ok: kinds.has('comment') && kinds.has('activity'), problems: [`activity types=${types.join(',')}`] });
  const sortedOk = stories?.data?.every((s, i, a) => i === 0 || a[i - 1].createdAt <= s.createdAt);
  results.push({ name: 'stories oldest first', ok: !!sortedOk, problems: [] });
  expect('PATCH completed=true', await admin('PATCH', `/tasks/${t1.id}`, { completed: true }), 200, TaskDetail);

  const notes = expect('GET /notifications (alice)', await alice('GET', '/notifications?limit=50'), 200, { data: arr(Notification), unreadCount: N });
  const mine = notes?.data?.filter((n) => n.task?.id === t1.id) ?? [];
  results.push({ name: 'alice notified (MENTIONED/COMPLETED) for smoke task', ok: mine.some((n) => n.type === 'MENTIONED'), problems: [`types=${mine.map((n) => n.type).join(',')}`] });
  expect('GET /notifications?unread=true', await alice('GET', '/notifications?unread=true'), 200, { data: arr(Notification), unreadCount: N });
  if (mine[0]) expect('POST /notifications/:id/read', await alice('POST', `/notifications/${mine[0].id}/read`), 204);

  const search = expect('GET /search?q=fe-smoke', await admin('GET', `/search?q=${encodeURIComponent('fe-smoke')}`), 200, { tasks: arr(Task), projects: arr(Project), users: arr(UserSummary) });
  results.push({ name: 'search finds smoke task+project', ok: search?.tasks?.length > 0 && search?.projects?.length > 0, problems: [`tasks=${search?.tasks?.length} projects=${search?.projects?.length}`] });
  expect('GET /search?q=a (too short) → 400', await admin('GET', '/search?q=a'), 400, ErrorBody);

  expect('GET /admin/users', await admin('GET', '/admin/users'), 200, List(User));
  expect('GET /admin/users as member → 403', await alice('GET', '/admin/users'), 403, ErrorBody);
  const inv = expect('POST /admin/invites', await admin('POST', '/admin/invites', { email: `fe-smoke-${Date.now()}@example.com`, role: 'MEMBER' }), 201, Invite);
  expect('GET /admin/invites', await admin('GET', '/admin/invites'), 200, List(Invite));
  expect('GET /auth/invites/:token (no auth)', await client('anon')('GET', `/auth/invites/${inv.token}`), 200, { email: S, role: oneOf('ADMIN', 'MEMBER') });
  expect('GET /auth/invites/garbage → 404', await client('anon')('GET', '/auth/invites/not-a-real-token'), 404, ErrorBody);
  expect('DELETE /admin/invites/:id', await admin('DELETE', `/admin/invites/${inv.id}`), 204);
  expect('GET deleted invite → 404|410', await client('anon')('GET', `/auth/invites/${inv.token}`), [404, 410], ErrorBody);

  expect('DELETE /sections/:id', await admin('DELETE', `/sections/${sec.id}`), 204);
  const moved = await admin('GET', `/tasks/${t2.id}`);
  results.push({ name: 'deleting a section → tasks sectionId=null', ok: moved.body?.sectionId === null, problems: [`sectionId=${moved.body?.sectionId}`] });
  expect('DELETE /tasks/:id', await admin('DELETE', `/tasks/${t1.id}`), 204);
  expect('GET deleted task → 404', await admin('GET', `/tasks/${sub.id}`), 404, ErrorBody);
} catch (e) {
  results.push({ name: 'UNCAUGHT', ok: false, problems: [String(e?.stack ?? e)] });
} finally {
  if (projectId) expect('cleanup DELETE /projects/:id', await admin('DELETE', `/projects/${projectId}`), 204);
  if (teamId) {
    expect('DELETE /teams/:id as member → 403', await alice('DELETE', `/teams/${teamId}`), 403, ErrorBody);
    expect('cleanup DELETE /teams/:id', await admin('DELETE', `/teams/${teamId}`), 204);
  }
  expect('POST /auth/logout', await admin('POST', '/auth/logout'), 204);
  expect('GET /auth/me after logout → 401', await admin('GET', '/auth/me'), 401, ErrorBody);
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  const extras = r.problems.filter((p) => p.endsWith('(info)'));
  const errs = r.problems.filter((p) => !p.endsWith('(info)'));
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok && errs.length ? `  [${errs.join('; ')}]` : ''}`);
  if (!r.ok) errs.forEach((p) => console.log(`        ${p}`));
  if (extras.length) console.log(`        info: ${[...new Set(extras.map((p) => p.replace(/\[\d+\]/g, '[]')))].join(', ')}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
