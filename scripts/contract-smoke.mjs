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
// (also on failure). The v1.1 goals block (end of file) also creates "[fe-smoke]" goals, a
// PRIVATE project and a goals-only team, and the §11 reports block a PRIVATE project; each block
// deletes its own data in its `finally`. It marks at most one of alice's smoke notifications as read
// and does not call read-all. Requires Node 20+ (global fetch, Headers#getSetCookie). Exit code 1 on
// any failure.
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
    // Raw bytes are kept for the CSV BOM check; TextDecoder strips a BOM like res.text() does.
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
    return { status: res.status, body: json, label, headers: res.headers, bytes };
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

  await contractV11Goals({ aliceUser, bobUser, teamId }); // v1.1 §10, defined at the end of this file
  await contractV11Reports({ aliceUser, bobUser, teamId }); // v1.1 §11, defined at the end of this file
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

// =====================================================================================
// v1.1 §10 Goals / OKRs (owned by platform/QA, asana-clone-a0). Self-contained: called once from
// the main flow, creates its own goals + a PRIVATE project in the smoke team, and deletes them in its
// own `finally` (before the main flow deletes the team, which 409s while the team has goals).
// =====================================================================================
async function contractV11Goals({ aliceUser, bobUser, teamId }) {
  const GoalStatus = oneOf('NO_STATUS', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ACHIEVED', 'PARTIAL', 'MISSED', 'DROPPED');
  const Goal = {
    id: S, title: S, description: nul(S), owner: UserSummary, team: nul({ id: S, name: S }), isCompany: B,
    parentId: nul(S), timePeriod: S, status: GoalStatus,
    progressSource: oneOf('KEY_RESULTS', 'SUB_GOALS', 'PROJECTS', 'MANUAL'),
    progress: N, weight: N, keyResultCount: N, childCount: N, canEdit: B, createdAt: S, updatedAt: S,
  };
  const KeyResult = {
    id: S, goalId: S, title: S, metricType: oneOf('NUMBER', 'PERCENT', 'CURRENCY', 'BOOLEAN'),
    startValue: N, targetValue: N, currentValue: N, unit: nul(S), owner: nul(UserSummary),
    progress: N, position: N, updatedAt: S,
  };
  const GoalUpdate = { id: S, goalId: S, author: UserSummary, status: GoalStatus, progress: N, body: nul(S), createdAt: S };
  const GoalDetail = {
    ...Goal, parent: nul({ id: S, title: S }), keyResults: arr(KeyResult), children: arr(Goal),
    projects: arr({ project: { id: S, name: S, color: S }, total: N, completed: N }),
    hiddenProjectCount: N, latestUpdate: nul(GoalUpdate),
  };
  const same = (name, actual, expected) =>
    results.push({ name, ok: JSON.stringify(actual) === JSON.stringify(expected), problems: [`got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`] });
  const errorPath = (body) => JSON.stringify(body?.error?.details ?? '');

  const now = new Date();
  const period = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
  const goalIds = []; // deleted in reverse order in `finally`
  let goalProjectId, bareTeamId;

  try {
    const periods = expect('GET /goals/time-periods', await admin('GET', '/goals/time-periods'), 200, List(S));
    results.push({ name: 'time-periods include a current quarter (YYYY-Qn)', ok: periods?.data?.some((p) => /^\d{4}-Q[1-4]$/.test(p)), problems: [`data=${JSON.stringify(periods?.data)}`] });

    // ---- levels & create permissions ----
    expect('POST company goal as member → 403', await alice('POST', '/goals', { title: `${PREFIX} co`, timePeriod: period, isCompany: true }), 403, ErrorBody);
    expect('POST goal isCompany + teamId → 400', await admin('POST', '/goals', { title: `${PREFIX} both`, timePeriod: period, isCompany: true, teamId }), 400, ErrorBody);
    expect('POST goal bad timePeriod → 400', await admin('POST', '/goals', { title: `${PREFIX} bad`, timePeriod: '2026-Q5' }), 400, ErrorBody);
    const company = expect('POST /goals (company, SUB_GOALS)', await admin('POST', '/goals', { title: `${PREFIX} company`, timePeriod: period, isCompany: true, progressSource: 'SUB_GOALS' }), 201, GoalDetail);
    goalIds.push(company.id);
    expect('POST team goal as non-member → 403 (bob)', await bob('POST', '/goals', { title: `${PREFIX} t`, timePeriod: period, teamId }), 403, ErrorBody);
    const teamGoal = expect('POST /goals (team, KEY_RESULTS, aligned)', await alice('POST', '/goals', { title: `${PREFIX} team goal`, timePeriod: period, teamId, parentId: company.id }), 201, GoalDetail);
    goalIds.push(teamGoal.id);
    same('team goal defaults (owner=caller, KEY_RESULTS, NO_STATUS, weight 1)', [teamGoal?.owner?.id, teamGoal?.progressSource, teamGoal?.status, teamGoal?.weight, teamGoal?.team?.id], [aliceUser.id, 'KEY_RESULTS', 'NO_STATUS', 1, teamId]);
    const personal = expect('POST /goals (personal, MANUAL, weight 3)', await bob('POST', '/goals', { title: `${PREFIX} personal`, timePeriod: period, parentId: company.id, progressSource: 'MANUAL', weight: 3 }), 201, GoalDetail);
    goalIds.push(personal.id);

    // ---- KEY_RESULTS progress: mean of KR progress ----
    const kr1 = expect('POST /goals/:id/key-results (NUMBER 0→200 @50)', await alice('POST', `/goals/${teamGoal.id}/key-results`, { title: `${PREFIX} signups`, metricType: 'NUMBER', targetValue: 200, currentValue: 50 }), 201, KeyResult);
    const kr2 = expect('POST key result (PERCENT decreasing 100→20 @60)', await alice('POST', `/goals/${teamGoal.id}/key-results`, { title: `${PREFIX} churn`, metricType: 'PERCENT', startValue: 100, targetValue: 20, currentValue: 60, unit: '%' }), 201, KeyResult);
    const kr3 = expect('POST key result (BOOLEAN)', await alice('POST', `/goals/${teamGoal.id}/key-results`, { title: `${PREFIX} launched`, metricType: 'BOOLEAN', targetValue: 1 }), 201, KeyResult);
    same('KR progress: NUMBER 25, decreasing PERCENT 50, BOOLEAN 0', [kr1?.progress, kr2?.progress, kr3?.progress], [25, 50, 0]);
    expect('PATCH BOOLEAN KR currentValue 0.5 → 400', await alice('PATCH', `/key-results/${kr3.id}`, { currentValue: 0.5 }), 400, ErrorBody);
    const kr3b = expect('PATCH /key-results/:id (BOOLEAN → 1)', await alice('PATCH', `/key-results/${kr3.id}`, { currentValue: 1 }), 200, KeyResult);
    same('BOOLEAN KR at 1 → 100', kr3b?.progress, 100);
    const over = expect('PATCH KR beyond target', await alice('PATCH', `/key-results/${kr1.id}`, { currentValue: 500 }), 200, KeyResult);
    same('KR progress clamps at 100', over?.progress, 100);
    await alice('PATCH', `/key-results/${kr1.id}`, { currentValue: 50 });
    const tg = expect('GET /goals/:id (team goal)', await alice('GET', `/goals/${teamGoal.id}`), 200, GoalDetail);
    // mean(25, 50, 100) = 58.33… → 58.3
    same('KEY_RESULTS progress = mean of KRs (58.3)', [tg?.progress, tg?.keyResultCount, tg?.keyResults?.map((k) => k.id)], [58.3, 3, [kr1.id, kr2.id, kr3.id]]);

    // ---- MANUAL ----
    const pm = expect('PATCH manualProgress', await bob('PATCH', `/goals/${personal.id}`, { manualProgress: 80 }), 200, GoalDetail);
    same('MANUAL progress = manualProgress', pm?.progress, 80);

    // ---- SUB_GOALS: weight-averaged children, rolled up unrounded ----
    // (58.333… × 1 + 80 × 3) / 4 = 74.58… → 74.6
    const co = expect('GET /goals/:id (company)', await admin('GET', `/goals/${company.id}`), 200, GoalDetail);
    same('SUB_GOALS progress = weighted mean of children (74.6)', [co?.progress, co?.childCount, co?.children?.map((c) => c.id).sort()], [74.6, 2, [teamGoal.id, personal.id].sort()]);

    // ---- edit permissions & KR owner ----
    const asBob = expect('GET team goal as non-member', await bob('GET', `/goals/${teamGoal.id}`), 200, GoalDetail);
    same('canEdit false for non-member, true for team member', [asBob?.canEdit, tg?.canEdit], [false, true]);
    expect('PATCH team goal as non-member → 403', await bob('PATCH', `/goals/${teamGoal.id}`, { title: `${PREFIX} hijack` }), 403, ErrorBody);
    const owned = expect('POST KR owned by bob on company goal', await admin('POST', `/goals/${company.id}/key-results`, { title: `${PREFIX} owned`, metricType: 'NUMBER', targetValue: 10, ownerId: bobUser.id }), 201, KeyResult);
    expect('KR owner may update currentValue', await bob('PATCH', `/key-results/${owned.id}`, { currentValue: 4 }), 200, KeyResult);
    expect('KR owner may not edit other KR fields → 403', await bob('PATCH', `/key-results/${owned.id}`, { title: `${PREFIX} renamed` }), 403, ErrorBody);
    const co2 = await admin('GET', `/goals/${company.id}`);
    same('KRs do not affect a SUB_GOALS goal', co2.body?.progress, 74.6);
    expect('DELETE /key-results/:id', await admin('DELETE', `/key-results/${owned.id}`), 204);

    // ---- cascade validation ----
    const cyc = expect('PATCH parentId creating a cycle → 400', await admin('PATCH', `/goals/${company.id}`, { parentId: teamGoal.id }), 400, ErrorBody);
    results.push({ name: 'cycle error details name parentId', ok: errorPath(cyc).includes('parentId'), problems: [`details=${errorPath(cyc)}`] });
    expect('PATCH goal as its own parent → 400', await alice('PATCH', `/goals/${teamGoal.id}`, { parentId: teamGoal.id }), 400, ErrorBody);

    // ---- PROJECTS: completed ÷ total over all tasks incl. subtasks; hidden projects ----
    const gp = expect('POST project for PROJECTS goal (PRIVATE)', await admin('POST', '/projects', { teamId, name: `${PREFIX} goal project`, privacy: 'PRIVATE' }), 201, ProjectDetail);
    goalProjectId = gp.id;
    const a = (await admin('POST', '/tasks', { title: `${PREFIX} a`, projectId: goalProjectId })).body;
    const b = (await admin('POST', '/tasks', { title: `${PREFIX} b`, projectId: goalProjectId })).body;
    const sb = (await admin('POST', '/tasks', { title: `${PREFIX} b.1`, parentId: b.id })).body;
    await admin('POST', '/tasks', { title: `${PREFIX} c`, projectId: goalProjectId });
    await admin('PATCH', `/tasks/${a.id}`, { completed: true });
    await admin('PATCH', `/tasks/${sb.id}`, { completed: true });
    const pg = expect('POST /goals (personal, PROJECTS)', await admin('POST', '/goals', { title: `${PREFIX} projects goal`, timePeriod: period, progressSource: 'PROJECTS' }), 201, GoalDetail);
    goalIds.push(pg.id);
    const linked = expect('POST /goals/:id/projects', await admin('POST', `/goals/${pg.id}/projects`, { projectId: goalProjectId }), 200, GoalDetail);
    // 4 tasks (a, b, b.1, c), 2 completed (a, b.1) → 50
    same('PROJECTS progress counts subtasks (2/4 → 50)', [linked?.progress, linked?.projects?.[0]?.total, linked?.projects?.[0]?.completed, linked?.hiddenProjectCount], [50, 4, 2, 0]);
    const hidden = expect('GET PROJECTS goal as user who cannot see the project', await bob('GET', `/goals/${pg.id}`), 200, GoalDetail);
    same('hidden project omitted + counted, still feeds progress', [hidden?.projects?.length, hidden?.hiddenProjectCount, hidden?.progress], [0, 1, 50]);
    expect('DELETE /goals/:id/projects/:projectId', await admin('DELETE', `/goals/${pg.id}/projects/${goalProjectId}`), 200, GoalDetail);

    // ---- status updates ----
    const up = expect('POST /goals/:id/updates', await alice('POST', `/goals/${teamGoal.id}/updates`, { status: 'AT_RISK', body: `${PREFIX} slipping` }), 201, GoalUpdate);
    same('update snapshots progress', up?.progress, 58.3);
    await alice('POST', `/goals/${teamGoal.id}/updates`, { status: 'ON_TRACK' });
    const ups = expect('GET /goals/:id/updates', await alice('GET', `/goals/${teamGoal.id}/updates`), 200, List(GoalUpdate));
    same('updates newest first', ups?.data?.map((u) => u.status).slice(0, 2), ['ON_TRACK', 'AT_RISK']);
    const after = await alice('GET', `/goals/${teamGoal.id}`);
    same('update sets goal status + latestUpdate', [after.body?.status, after.body?.latestUpdate?.status], ['ON_TRACK', 'ON_TRACK']);
    expect('POST update as non-editor → 403 (bob)', await bob('POST', `/goals/${teamGoal.id}/updates`, { status: 'OFF_TRACK' }), 403, ErrorBody);

    // ---- list filters ----
    const listed = expect('GET /goals?timePeriod=', await admin('GET', `/goals?timePeriod=${period}`), 200, List(Goal));
    results.push({ name: 'GET /goals lists smoke goals for the period', ok: [company.id, teamGoal.id, personal.id].every((id) => listed?.data?.some((g) => g.id === id)), problems: [] });
    const cos = expect('GET /goals?company=true', await admin('GET', '/goals?company=true'), 200, List(Goal));
    results.push({ name: '?company=true returns only company goals', ok: cos?.data?.every((g) => g.isCompany), problems: [] });
    expect('GET /goals?teamId=&q=', await admin('GET', `/goals?teamId=${teamId}&q=${encodeURIComponent('fe-smoke')}`), 200, List(Goal));

    // ---- team delete blocked by goals alone (the smoke team also has projects, so use a bare team) ----
    const bare = expect('POST /teams (goals-only)', await admin('POST', '/teams', { name: `${PREFIX} goals-only team` }), 201, TeamDetail);
    bareTeamId = bare.id;
    const bareGoal = expect('POST /goals (team goal as ADMIN, not a member)', await admin('POST', '/goals', { title: `${PREFIX} bare`, timePeriod: period, teamId: bareTeamId }), 201, GoalDetail);
    goalIds.push(bareGoal.id);
    expect('DELETE /teams/:id with only goals → 409', await admin('DELETE', `/teams/${bareTeamId}`), 409, ErrorBody);

    // ---- deleting a parent orphans its children ----
    expect('DELETE /goals/:id (company)', await admin('DELETE', `/goals/${company.id}`), 204);
    goalIds.splice(goalIds.indexOf(company.id), 1);
    const orphan = await alice('GET', `/goals/${teamGoal.id}`);
    same('children of a deleted goal get parentId=null', orphan.body?.parentId, null);
  } finally {
    for (const id of goalIds.reverse()) {
      const res = await admin('DELETE', `/goals/${id}`);
      if (res.status !== 204 && res.status !== 404) expect(`cleanup DELETE /goals/${id}`, res, 204);
    }
    if (goalProjectId) expect('cleanup DELETE goal project', await admin('DELETE', `/projects/${goalProjectId}`), 204);
    // Goals are gone now, so this also checks the 409 above was about goals.
    if (bareTeamId) expect('DELETE /teams/:id once its goals are deleted', await admin('DELETE', `/teams/${bareTeamId}`), 204);
  }
}

// =====================================================================================
// v1.1 §11 Reporting (owned by platform/QA, asana-clone-a0). Self-contained like the goals block:
// creates one PRIVATE project with known tasks in the smoke team, checks the reports against
// exact expected numbers, and deletes the project in its own `finally`.
// =====================================================================================
async function contractV11Reports({ aliceUser, bobUser, teamId }) {
  const Counts = { total: N, completed: N, incomplete: N, overdue: N };
  const ProjectReport = {
    project: { id: S, name: S, color: S },
    totals: { ...Counts, unassigned: N, percentComplete: N },
    bySection: arr({ sectionId: nul(S), name: S, total: N, completed: N, overdue: N }),
    byAssignee: arr({ assignee: nul(UserSummary), incomplete: N, completed: N, overdue: N }),
    byPriority: arr({ priority: oneOf('NONE', 'LOW', 'MEDIUM', 'HIGH'), total: N, incomplete: N }),
    trend: arr({ weekStart: S, created: N, completed: N, open: N }),
    upcoming: arr(Task),
  };
  const OverviewReport = {
    totals: { ...Counts, projects: N },
    projects: arr({ ...Counts, project: Project, percentComplete: N, lastActivityAt: nul(S) }),
  };
  const WorkloadReport = {
    from: S, to: S,
    data: arr({ user: UserSummary, open: N, overdue: N, dueInRange: N, completedInRange: N }),
  };
  const same = (name, actual, expected) =>
    results.push({ name, ok: JSON.stringify(actual) === JSON.stringify(expected), problems: [`got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`] });

  // "Today" as the BE sees it (APP_TIMEZONE, SPEC §11), and date-only arithmetic in UTC.
  const tz = process.env.APP_TIMEZONE ?? 'Asia/Jakarta';
  const zToday = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const plusDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  let reportProjectId;
  try {
    // ---- fixture: PRIVATE project, alice is an EDITOR, bob has no access ----
    const p = expect('POST project for reports (PRIVATE)', await admin('POST', '/projects', { teamId, name: `${PREFIX} report Q4!`, privacy: 'PRIVATE' }), 201, ProjectDetail);
    reportProjectId = p.id;
    await admin('POST', `/projects/${p.id}/members`, { userId: aliceUser.id, role: 'EDITOR' });
    const [todo, doing] = p.sections; // "To do", "In progress"
    const mk = async (body) => (await admin('POST', '/tasks', { projectId: p.id, ...body })).body;
    // To do: A (alice, HIGH, overdue), C (unassigned, done), E (alice, done today)
    const A = await mk({ title: '=SUM(1) overdue', sectionId: todo.id, assigneeId: aliceUser.id, priority: 'HIGH', dueDate: plusDays(zToday, -1) });
    const C = await mk({ title: `${PREFIX} done unassigned`, sectionId: todo.id });
    const E = await mk({ title: '+1 call done', sectionId: todo.id, assigneeId: aliceUser.id });
    // In progress: B (alice, LOW, due in 2 days) with subtask B1 (unassigned, open)
    const Bt = await mk({ title: 'Quote "x", comma', sectionId: doing.id, assigneeId: aliceUser.id, priority: 'LOW', dueDate: plusDays(zToday, 2) });
    const B1 = await mk({ title: `${PREFIX} sub of B`, parentId: Bt.id });
    // No section: D (unassigned, MEDIUM, multi-line title)
    const D = await mk({ title: 'line one\nline two', priority: 'MEDIUM' });
    await admin('PATCH', `/tasks/${C.id}`, { completed: true });
    await admin('PATCH', `/tasks/${E.id}`, { completed: true });
    results.push({ name: 'report fixture created', ok: [A, C, E, Bt, B1, D].every((t) => t?.id), problems: [] });

    // ---- GET /projects/:id/report ----
    const r = expect('GET /projects/:id/report?weeks=4', await admin('GET', `/projects/${p.id}/report?weeks=4`), 200, ProjectReport);
    // 6 tasks incl. the subtask; done C, E; overdue A; unassigned = incomplete & unassigned = B1, D (not C).
    same('report totals (subtasks counted, unassigned = incomplete only)', r?.totals, { total: 6, completed: 2, incomplete: 4, overdue: 1, unassigned: 2, percentComplete: 33.3 });
    const sec = (id) => r?.bySection?.find((s) => s.sectionId === id);
    same('bySection: To do 3/2 done/1 overdue; subtask under parent section (In progress 2)', [sec(todo.id)?.total, sec(todo.id)?.completed, sec(todo.id)?.overdue, sec(doing.id)?.total], [3, 2, 1, 2]);
    same('bySection: "No section" last', [r?.bySection?.at(-1)?.sectionId, r?.bySection?.at(-1)?.total], [null, 1]);
    const byA = (uid) => r?.byAssignee?.find((x) => (x.assignee?.id ?? null) === uid);
    same('byAssignee alice / unassigned', [byA(aliceUser.id), byA(null)].map((x) => x && [x.incomplete, x.completed, x.overdue]), [[2, 1, 1], [2, 1, 0]]);
    results.push({ name: 'byAssignee sorted by incomplete desc', ok: !!r?.byAssignee?.every((x, i, a) => i === 0 || a[i - 1].incomplete >= x.incomplete), problems: [] });
    same('byPriority: all four, HIGH→NONE', r?.byPriority?.map((x) => [x.priority, x.total, x.incomplete]), [['HIGH', 1, 1], ['MEDIUM', 1, 1], ['LOW', 1, 1], ['NONE', 3, 1]]);
    const last = r?.trend?.at(-1);
    same('trend: 4 Monday weeks oldest→newest; this week created 6 / completed 2 / open 4', [r?.trend?.length, new Date(`${last?.weekStart}T00:00:00Z`).getUTCDay(), r?.trend?.every((w, i, a) => i === 0 || a[i - 1].weekStart < w.weekStart), last?.created, last?.completed, last?.open], [4, 1, true, 6, 2, 4]);
    same('upcoming: incomplete, due today..+14d (not overdue A)', r?.upcoming?.map((t) => t.id), [Bt.id]);
    expect('GET report weeks=53 → 400', await admin('GET', `/projects/${p.id}/report?weeks=53`), 400, ErrorBody);
    expect('GET report as non-member → 404 (bob)', await bob('GET', `/projects/${p.id}/report`), 404, ErrorBody);
    expect('GET report as project member (alice)', await alice('GET', `/projects/${p.id}/report`), 200, ProjectReport);

    // ---- GET /reports/overview ----
    const ov = expect('GET /reports/overview?teamId=', await admin('GET', `/reports/overview?teamId=${teamId}`), 200, OverviewReport);
    const row = ov?.projects?.find((x) => x.project.id === p.id);
    same('overview row for report project', row && [row.total, row.completed, row.incomplete, row.overdue, row.percentComplete, typeof row.lastActivityAt], [6, 2, 4, 1, 33.3, 'string']);
    results.push({ name: 'overview projects sorted by name', ok: !!ov?.projects?.every((x, i, a) => i === 0 || a[i - 1].project.name.localeCompare(x.project.name) <= 0), problems: [] });
    const ovBob = expect('GET /reports/overview as bob', await bob('GET', `/reports/overview?teamId=${teamId}`), 200, OverviewReport);
    same('overview hides projects the caller cannot see', ovBob?.projects?.some((x) => x.project.id === p.id), false);

    // ---- GET /reports/workload (strict §4 visibility) ----
    const range = `from=${zToday}&to=${plusDays(zToday, 6)}`;
    const wl = expect('GET /reports/workload?teamId=&from=&to=', await admin('GET', `/reports/workload?teamId=${teamId}&${range}`), 200, WorkloadReport);
    const wa = wl?.data?.find((x) => x.user.id === aliceUser.id);
    // open A,B; overdue A; dueInRange = incomplete due in range = B; completedInRange = E.
    same('workload (admin view) for alice', wa && [wa.open, wa.overdue, wa.dueInRange, wa.completedInRange], [2, 1, 1, 1]);
    same('workload echoes the range', [wl?.from, wl?.to], [zToday, plusDays(zToday, 6)]);
    same('workload ?teamId lists only team members (no bob)', wl?.data?.some((x) => x.user.id === bobUser.id), false);
    const wlBob = expect('GET /reports/workload as bob', await bob('GET', `/reports/workload?teamId=${teamId}&${range}`), 200, WorkloadReport);
    const wb = wlBob?.data?.find((x) => x.user.id === aliceUser.id);
    same('workload counts only tasks the caller can see (bob: alice all 0)', wb && [wb.open, wb.overdue, wb.dueInRange, wb.completedInRange], [0, 0, 0, 0]);
    const def = expect('GET /reports/workload (default range)', await admin('GET', '/reports/workload'), 200, WorkloadReport);
    same('default range = this Monday..Sunday', [new Date(`${def?.from}T00:00:00Z`).getUTCDay(), def?.to === (def?.from && plusDays(def.from, 6))], [1, true]);
    expect('workload from > to → 400', await admin('GET', `/reports/workload?from=${plusDays(zToday, 1)}&to=${zToday}`), 400, ErrorBody);
    expect('workload range > 92 days → 400', await admin('GET', `/reports/workload?from=${zToday}&to=${plusDays(zToday, 92)}`), 400, ErrorBody);
    expect('workload unknown teamId → 404', await admin('GET', '/reports/workload?teamId=00000000-0000-4000-8000-000000000000'), 404, ErrorBody);

    // ---- GET /projects/:id/tasks.csv (raw bytes: `body` has the BOM decoded away) ----
    const csvRes = await admin('GET', `/projects/${p.id}/tasks.csv`);
    const ctype = csvRes.headers.get('content-type') ?? '';
    const disp = csvRes.headers.get('content-disposition') ?? '';
    same('CSV 200 + text/csv; charset=utf-8 + attachment filename', [csvRes.status, /^text\/csv;\s*charset=utf-8$/i.test(ctype), disp], [200, true, 'attachment; filename="fe-smoke-report-q4-tasks.csv"']);
    same('CSV starts with a UTF-8 BOM (EF BB BF)', [...csvRes.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(csvRes.bytes).replace(/^\uFEFF/, '');
    const rows = parseCsv(text);
    same('CSV records end with CRLF (header + trailing)', [text.startsWith(`${rows.header.join(',')}\r\n`), text.endsWith('\r\n'), rows.bareLf], [true, true, 0]);
    same('CSV header', rows.header.join(','), 'id,title,section,parent_task_id,assignee_name,assignee_email,priority,start_date,due_date,completed,completed_at,created_at');
    // List order: To do (A, C, E), In progress (B then its subtask B1), then no section (D).
    same('CSV rows in list order, subtasks after their parent', rows.records.map((x) => x[0]), [A.id, C.id, E.id, Bt.id, B1.id, D.id]);
    const col = (rec, name) => rec?.[rows.header.indexOf(name)];
    const recOf = (id) => rows.records.find((x) => x[0] === id);
    same('CSV formula-injection prefix for = and +', [col(recOf(A.id), 'title'), col(recOf(E.id), 'title')], ["'=SUM(1) overdue", "'+1 call done"]);
    same('CSV RFC 4180 quoting round-trips quotes, commas, newlines', [col(recOf(Bt.id), 'title'), col(recOf(D.id), 'title')], ['Quote "x", comma', 'line one\nline two']);
    same('CSV subtask: parent section + parent_task_id', [col(recOf(B1.id), 'section'), col(recOf(B1.id), 'parent_task_id')], ['In progress', Bt.id]);
    same('CSV cells: assignee, priority, dates, completed', [col(recOf(A.id), 'assignee_email'), col(recOf(A.id), 'priority'), col(recOf(A.id), 'due_date'), col(recOf(A.id), 'completed'), col(recOf(C.id), 'completed'), col(recOf(D.id), 'section')], [aliceUser.email, 'HIGH', plusDays(zToday, -1), 'false', 'true', '']);
    expect('GET tasks.csv as non-member → 404 (bob)', await bob('GET', `/projects/${p.id}/tasks.csv`), 404, ErrorBody);
  } finally {
    if (reportProjectId) expect('cleanup DELETE report project', await admin('DELETE', `/projects/${reportProjectId}`), 204);
  }
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF records. Counts bare LFs outside quotes. */
function parseCsv(text) {
  const records = [];
  let field = '', record = [], quoted = false, bareLf = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { record.push(field); field = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { record.push(field); records.push(record); field = ''; record = []; i++; }
    else if (ch === '\n') { bareLf++; record.push(field); records.push(record); field = ''; record = []; }
    else field += ch;
  }
  if (field || record.length) { record.push(field); records.push(record); }
  return { header: records[0] ?? [], records: records.slice(1), bareLf };
}
