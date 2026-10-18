// In-memory data store for the mock backend. Rows mirror the Prisma model in docs/SPEC.md §3.
import { addDays, format } from 'date-fns';
import type {
  GoalStatus,
  MetricType,
  NotificationType,
  ProgressSource,
  Priority,
  Privacy,
  ProjectRole,
  ProjectView,
  WorkspaceRole,
} from '@/api/types';

export type UserRow = {
  id: string;
  email: string;
  name: string;
  password: string;
  /** Global login switch (only the CLI/DB sets it); workspace access is WorkspaceMemberRow.isActive. */
  isActive: boolean;
  avatarColor: string;
  createdAt: string;
  lastWorkspaceId: string | null;
};
export type WorkspaceRow = {
  id: string;
  name: string;
  isOrganization: boolean;
  /** lowercase, set only for organizations */
  domain: string | null;
  color: string;
  createdAt: string;
};
export type WorkspaceMemberRow = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  isActive: boolean;
  joinedAt: string;
};
export type InviteRow = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  invitedById: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};
export type TeamRow = { id: string; workspaceId: string; name: string; description: string | null; createdAt: string };
export type TeamMemberRow = { teamId: string; userId: string };
export type ProjectRow = {
  id: string;
  workspaceId: string;
  teamId: string;
  ownerId: string;
  name: string;
  description: string | null;
  color: string;
  privacy: Privacy;
  archived: boolean;
  defaultView: ProjectView;
  createdAt: string;
  updatedAt: string;
};
export type ProjectMemberRow = { projectId: string; userId: string; role: ProjectRole };
export type SectionRow = { id: string; projectId: string; name: string; position: number };
export type TaskRow = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  sectionId: string | null;
  parentId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  creatorId: string;
  dueDate: string | null;
  startDate: string | null;
  priority: Priority;
  completed: boolean;
  completedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};
export type FollowerRow = { taskId: string; userId: string };
export type CommentRow = {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
};
export type ActivityRow = {
  id: string;
  taskId: string;
  actorId: string;
  type: string;
  data: unknown;
  createdAt: string;
};
export type NotificationRow = {
  id: string;
  workspaceId: string;
  userId: string;
  actorId: string;
  taskId: string | null;
  type: NotificationType;
  read: boolean;
  createdAt: string;
};

export type GoalRow = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  ownerId: string;
  isCompany: boolean;
  teamId: string | null;
  parentId: string | null;
  timePeriod: string;
  status: GoalStatus;
  progressSource: ProgressSource;
  manualProgress: number;
  weight: number;
  createdAt: string;
  updatedAt: string;
};
export type KeyResultRow = {
  id: string;
  goalId: string;
  title: string;
  metricType: MetricType;
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  ownerId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};
export type GoalProjectRow = { goalId: string; projectId: string };
export type GoalUpdateRow = {
  id: string;
  goalId: string;
  authorId: string;
  status: GoalStatus;
  progress: number;
  body: string | null;
  createdAt: string;
};

export type MockDb = {
  /** userId of the "cookie" session, or null when logged out */
  sessionUserId: string | null;
  /** failed login attempts per email (mock rate limiting) */
  loginFailures?: Record<string, number>;
  seq: number;
  workspaces: WorkspaceRow[];
  workspaceMembers: WorkspaceMemberRow[];
  users: UserRow[];
  invites: InviteRow[];
  teams: TeamRow[];
  teamMembers: TeamMemberRow[];
  projects: ProjectRow[];
  projectMembers: ProjectMemberRow[];
  sections: SectionRow[];
  tasks: TaskRow[];
  followers: FollowerRow[];
  comments: CommentRow[];
  activities: ActivityRow[];
  notifications: NotificationRow[];
  // v1.1 — optional so localStorage DBs saved before goals existed still load.
  goals?: GoalRow[];
  keyResults?: KeyResultRow[];
  goalProjects?: GoalProjectRow[];
  goalUpdates?: GoalUpdateRow[];
};

export function uid(db: MockDb, prefix = 'id'): string {
  db.seq += 1;
  // UUID-looking but deterministic, which keeps tests stable.
  const n = db.seq.toString(16).padStart(12, '0');
  const p = prefix.padEnd(8, '0').slice(0, 8).replace(/[^0-9a-f]/g, 'a');
  return `${p}-0000-4000-8000-${n}`;
}

const day = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd');

export function createSeedDb(): MockDb {
  const now = new Date().toISOString();
  const db: MockDb = {
    sessionUserId: null,
    seq: 0,
    workspaces: [],
    workspaceMembers: [],
    users: [],
    invites: [],
    teams: [],
    teamMembers: [],
    projects: [],
    projectMembers: [],
    sections: [],
    tasks: [],
    followers: [],
    comments: [],
    activities: [],
    notifications: [],
  };

  const mkWorkspace = (name: string, color: string, domain: string | null = null) => {
    const w: WorkspaceRow = { id: uid(db, 'wksp'), name, isOrganization: !!domain, domain, color, createdAt: now };
    db.workspaces.push(w);
    return w;
  };
  const join = (w: WorkspaceRow, u: UserRow, role: WorkspaceRole) => {
    db.workspaceMembers.push({ workspaceId: w.id, userId: u.id, role, isActive: true, joinedAt: now });
    u.lastWorkspaceId ??= w.id;
  };
  // SPEC §12 seed: "Mekari" (organization on example.com) holds the v1 data; "Acme Pilot" is a
  // small second workspace with a guest.
  const mekari = mkWorkspace('Mekari', '#651fff', 'example.com');
  let ws = mekari;

  const mkUser = (name: string, email: string, role: WorkspaceRole | null, avatarColor: string) => {
    const u: UserRow = {
      id: uid(db, 'user'),
      email,
      name,
      password: 'password123',
      isActive: true,
      avatarColor,
      createdAt: now,
      lastWorkspaceId: null,
    };
    db.users.push(u);
    if (role) join(ws, u, role);
    return u;
  };
  const admin = mkUser('Ada Admin', 'admin@example.com', 'ADMIN', '#8d84e8');
  const alice = mkUser('Alice Anderson', 'alice@example.com', 'MEMBER', '#4ecbc4');
  const bob = mkUser('Bob Brown', 'bob@example.com', 'MEMBER', '#f1bd6c');
  const carol = mkUser('Carol Chen', 'carol@example.com', 'MEMBER', '#e362e3');

  const mkTeam = (name: string, description: string, members: UserRow[]) => {
    const t: TeamRow = { id: uid(db, 'team'), workspaceId: ws.id, name, description, createdAt: now };
    db.teams.push(t);
    members.forEach((m) => db.teamMembers.push({ teamId: t.id, userId: m.id }));
    return t;
  };
  const eng = mkTeam('Engineering', 'Builders of things', [admin, alice, bob]);
  const mkt = mkTeam('Marketing', 'Telling the world', [admin, carol, alice]);

  const mkProject = (
    team: TeamRow,
    owner: UserRow,
    name: string,
    color: string,
    privacy: Privacy = 'TEAM',
  ) => {
    const p: ProjectRow = {
      id: uid(db, 'proj'),
      workspaceId: team.workspaceId,
      teamId: team.id,
      ownerId: owner.id,
      name,
      description: `${name} — tracked in Mekari Project.`,
      color,
      privacy,
      archived: false,
      defaultView: 'LIST',
      createdAt: now,
      updatedAt: now,
    };
    db.projects.push(p);
    db.projectMembers.push({ projectId: p.id, userId: owner.id, role: 'OWNER' });
    const sections = ['To do', 'In progress', 'Done'].map((s, i) => {
      const row: SectionRow = { id: uid(db, 'sect'), projectId: p.id, name: s, position: (i + 1) * 1000 };
      db.sections.push(row);
      return row;
    });
    return { p, sections };
  };

  let pos = 0;
  const mkTask = (
    project: ProjectRow | null,
    section: SectionRow | null,
    title: string,
    opts: Partial<TaskRow> = {},
  ) => {
    pos += 1000;
    const t: TaskRow = {
      id: uid(db, 'task'),
      workspaceId: project?.workspaceId ?? ws.id,
      projectId: project?.id ?? null,
      sectionId: section?.id ?? null,
      parentId: null,
      title,
      description: null,
      assigneeId: null,
      creatorId: admin.id,
      dueDate: null,
      startDate: null,
      priority: 'NONE',
      completed: false,
      completedAt: null,
      position: pos,
      createdAt: now,
      updatedAt: now,
      ...opts,
    };
    // Spread creation (and completion) over the last ~8 weeks so reports have a real trend.
    const ageDays = (pos / 1000) * 5 % 56;
    t.createdAt = new Date(Date.now() - ageDays * 864e5).toISOString();
    if (t.completed) t.completedAt = new Date(Date.now() - Math.max(0, ageDays - 6) * 864e5).toISOString();
    db.tasks.push(t);
    db.followers.push({ taskId: t.id, userId: t.creatorId });
    if (t.assigneeId && t.assigneeId !== t.creatorId) {
      db.followers.push({ taskId: t.id, userId: t.assigneeId });
    }
    db.activities.push({
      id: uid(db, 'actv'),
      taskId: t.id,
      actorId: t.creatorId,
      type: 'CREATED',
      data: {},
      createdAt: now,
    });
    return t;
  };

  const web = mkProject(eng, admin, 'Website Redesign', '#f06a6a');
  const [wTodo, wProg, wDone] = web.sections;
  const t1 = mkTask(web.p, wTodo, 'Draft new homepage copy', {
    assigneeId: alice.id,
    dueDate: day(2),
    priority: 'HIGH',
    description: 'Hero, features, testimonials.\n\nKeep it **short**.',
  });
  mkTask(web.p, wTodo, 'Pick a font pairing', { assigneeId: bob.id, dueDate: day(5), priority: 'LOW' });
  mkTask(web.p, wTodo, 'Audit accessibility of nav', { assigneeId: admin.id, dueDate: day(-1), priority: 'MEDIUM' });
  mkTask(web.p, wTodo, 'Collect customer logos', { dueDate: day(9) });
  const t5 = mkTask(web.p, wProg, 'Build responsive header', {
    assigneeId: admin.id,
    dueDate: day(0),
    priority: 'HIGH',
  });
  mkTask(web.p, wProg, 'Set up analytics', { assigneeId: bob.id, dueDate: day(3) });
  mkTask(web.p, wProg, 'Migrate blog posts', { assigneeId: alice.id, dueDate: day(12), priority: 'MEDIUM' });
  mkTask(web.p, wDone, 'Kickoff meeting', {
    assigneeId: admin.id,
    dueDate: day(-7),
    completed: true,
    completedAt: now,
  });
  mkTask(web.p, wDone, 'Competitor review', {
    assigneeId: alice.id,
    dueDate: day(-4),
    completed: true,
    completedAt: now,
  });
  mkTask(web.p, null, 'Unsorted idea: dark mode', {});
  mkTask(web.p, null, 'Write launch checklist', { parentId: t1.id, assigneeId: alice.id, dueDate: day(1) });
  mkTask(web.p, null, 'Get legal sign-off', { parentId: t1.id, assigneeId: admin.id, completed: true, completedAt: now });
  mkTask(web.p, null, 'Mobile breakpoints', { parentId: t5.id, assigneeId: admin.id, dueDate: day(1) });

  const api = mkProject(eng, alice, 'API v2', '#4573d2');
  const [aTodo, aProg, aDone] = api.sections;
  mkTask(api.p, aTodo, 'Design pagination scheme', { assigneeId: alice.id, dueDate: day(4), priority: 'MEDIUM', creatorId: alice.id });
  mkTask(api.p, aTodo, 'Rate limiting', { assigneeId: bob.id, dueDate: day(10), priority: 'HIGH', creatorId: alice.id });
  mkTask(api.p, aTodo, 'Deprecation notices for v1', { assigneeId: admin.id, dueDate: day(6), creatorId: alice.id });
  mkTask(api.p, aProg, 'Auth middleware rewrite', { assigneeId: admin.id, dueDate: day(1), priority: 'HIGH', creatorId: alice.id });
  mkTask(api.p, aProg, 'OpenAPI spec', { assigneeId: alice.id, dueDate: day(8), creatorId: alice.id });
  mkTask(api.p, aDone, 'Benchmark current endpoints', { assigneeId: bob.id, completed: true, completedAt: now, creatorId: alice.id });
  mkTask(api.p, aTodo, 'Error code catalogue', { dueDate: day(14), creatorId: alice.id });

  const launch = mkProject(mkt, carol, 'Q4 Launch Campaign', '#5da283', 'PUBLIC');
  const [lTodo, lProg, lDone] = launch.sections;
  mkTask(launch.p, lTodo, 'Write press release', { assigneeId: carol.id, dueDate: day(3), priority: 'HIGH', creatorId: carol.id });
  mkTask(launch.p, lTodo, 'Book podcast slots', { assigneeId: alice.id, dueDate: day(11), creatorId: carol.id });
  mkTask(launch.p, lTodo, 'Social media calendar', { assigneeId: carol.id, dueDate: day(6), priority: 'MEDIUM', creatorId: carol.id });
  mkTask(launch.p, lProg, 'Landing page A/B test', { assigneeId: admin.id, dueDate: day(2), creatorId: carol.id });
  mkTask(launch.p, lProg, 'Newsletter draft', { assigneeId: carol.id, dueDate: day(-2), priority: 'LOW', creatorId: carol.id });
  mkTask(launch.p, lDone, 'Budget approval', { assigneeId: carol.id, completed: true, completedAt: now, creatorId: carol.id });
  mkTask(launch.p, lTodo, 'Partner outreach list', { assigneeId: bob.id, dueDate: day(20), creatorId: carol.id });

  mkTask(null, null, 'Renew conference badge', { assigneeId: admin.id, dueDate: day(15) });
  mkTask(null, null, 'Expense report', { assigneeId: admin.id, dueDate: day(-3), priority: 'MEDIUM' });

  db.comments.push({
    id: uid(db, 'cmnt'),
    taskId: t1.id,
    authorId: alice.id,
    body: `Started on this — @[Ada Admin](${admin.id}) can you review the tone?`,
    createdAt: now,
    editedAt: null,
  });
  db.followers.push({ taskId: t1.id, userId: alice.id });
  db.notifications.push(
    {
      id: uid(db, 'ntfy'),
      workspaceId: mekari.id,
      userId: admin.id,
      actorId: alice.id,
      taskId: t1.id,
      type: 'MENTIONED',
      read: false,
      createdAt: now,
    },
    {
      id: uid(db, 'ntfy'),
      workspaceId: mekari.id,
      userId: admin.id,
      actorId: carol.id,
      taskId: db.tasks.find((t) => t.title === 'Landing page A/B test')!.id,
      type: 'ASSIGNED',
      read: false,
      createdAt: now,
    },
  );

  seedGoals(db, { workspaceId: mekari.id, admin, alice, bob, carol, eng, mkt, webProjectId: web.p.id });

  // ---- Acme Pilot: alice ADMIN, bob MEMBER, a guest on one project ----
  const acme = mkWorkspace('Acme Pilot', '#f1bd6c');
  ws = acme;
  join(acme, alice, 'ADMIN');
  join(acme, bob, 'MEMBER');
  const guest = mkUser('Gina Guest', 'guest@partner.test', 'GUEST', '#f26fb2');
  const pilot = mkTeam('Pilot Team', 'Running the Acme pilot', [alice, bob]);
  const rollout = mkProject(pilot, alice, 'Pilot Rollout', '#4573d2');
  db.projectMembers.push(
    { projectId: rollout.p.id, userId: bob.id, role: 'EDITOR' },
    { projectId: rollout.p.id, userId: guest.id, role: 'EDITOR' },
  );
  const [rTodo, rProg, rDone] = rollout.sections;
  mkTask(rollout.p, rTodo, 'Kick-off with Acme', { assigneeId: alice.id, dueDate: day(1), creatorId: alice.id });
  mkTask(rollout.p, rTodo, 'Share access checklist', { assigneeId: guest.id, dueDate: day(3), creatorId: alice.id });
  mkTask(rollout.p, rTodo, 'Import Acme backlog', { assigneeId: bob.id, dueDate: day(5), priority: 'MEDIUM', creatorId: alice.id });
  mkTask(rollout.p, rProg, 'Configure SSO', { assigneeId: bob.id, dueDate: day(2), priority: 'HIGH', creatorId: alice.id });
  mkTask(rollout.p, rProg, 'Pilot feedback survey', { assigneeId: guest.id, dueDate: day(8), creatorId: alice.id });
  mkTask(rollout.p, rProg, 'Weekly sync notes', { assigneeId: alice.id, creatorId: alice.id });
  mkTask(rollout.p, rDone, 'Sign pilot agreement', { assigneeId: alice.id, completed: true, completedAt: now, creatorId: alice.id });
  mkTask(rollout.p, rDone, 'Create Acme workspace', { assigneeId: alice.id, completed: true, completedAt: now, creatorId: alice.id });
  const internal = mkProject(pilot, bob, 'Pilot internal notes', '#6d6e6f');
  mkTask(internal.p, internal.sections[0], 'Pricing for Acme', { assigneeId: bob.id, creatorId: bob.id });
  db.notifications.push({
    id: uid(db, 'ntfy'),
    workspaceId: acme.id,
    userId: bob.id,
    actorId: alice.id,
    taskId: db.tasks.find((t) => t.title === 'Configure SSO')!.id,
    type: 'ASSIGNED',
    read: false,
    createdAt: now,
  });
  return db;
}

/** SPEC §10 seed: company goal (SUB_GOALS) → 2 team goals → individual goals with KRs. */
function seedGoals(
  db: MockDb,
  r: { workspaceId: string; admin: UserRow; alice: UserRow; bob: UserRow; carol: UserRow; eng: TeamRow; mkt: TeamRow; webProjectId: string },
) {
  const now = new Date();
  const iso = now.toISOString();
  const quarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  const year = String(now.getFullYear());
  db.goals = [];
  db.keyResults = [];
  db.goalProjects = [];
  db.goalUpdates = [];
  const goal = (g: Partial<GoalRow> & Pick<GoalRow, 'title' | 'ownerId'>) => {
    const row: GoalRow = {
      id: uid(db, 'goal'),
      workspaceId: r.workspaceId,
      description: null,
      isCompany: false,
      teamId: null,
      parentId: null,
      timePeriod: quarter,
      status: 'NO_STATUS',
      progressSource: 'KEY_RESULTS',
      manualProgress: 0,
      weight: 1,
      createdAt: iso,
      updatedAt: iso,
      ...g,
    };
    db.goals!.push(row);
    return row;
  };
  let krPos = 0;
  const kr = (goalId: string, k: Partial<KeyResultRow> & Pick<KeyResultRow, 'title' | 'targetValue'>) => {
    krPos += 1000;
    const row: KeyResultRow = {
      id: uid(db, 'kres'),
      goalId,
      metricType: 'NUMBER',
      startValue: 0,
      currentValue: 0,
      unit: null,
      ownerId: null,
      position: krPos,
      createdAt: iso,
      updatedAt: iso,
      ...k,
    };
    db.keyResults!.push(row);
    return row;
  };

  const company = goal({
    title: 'Become the go-to tool for internal planning',
    description: 'Company objective for the quarter.',
    ownerId: r.admin.id,
    isCompany: true,
    progressSource: 'SUB_GOALS',
    status: 'ON_TRACK',
  });
  const engGoal = goal({ title: 'Ship a delightful v1.1', ownerId: r.alice.id, teamId: r.eng.id, parentId: company.id, progressSource: 'SUB_GOALS', weight: 2, status: 'ON_TRACK' });
  const mktGoal = goal({ title: 'Grow internal adoption', ownerId: r.carol.id, teamId: r.mkt.id, parentId: company.id, status: 'AT_RISK' });
  kr(mktGoal.id, { title: 'Weekly active users', targetValue: 80, startValue: 20, currentValue: 41, ownerId: r.carol.id });
  kr(mktGoal.id, { title: 'Teams onboarded', metricType: 'PERCENT', targetValue: 100, currentValue: 35, unit: '%' });

  const web = goal({ title: 'Launch the redesigned website', ownerId: r.admin.id, parentId: engGoal.id, progressSource: 'PROJECTS', status: 'ON_TRACK' });
  db.goalProjects!.push({ goalId: web.id, projectId: r.webProjectId });
  const perf = goal({ title: 'Make the app fast', ownerId: r.bob.id, parentId: engGoal.id, status: 'OFF_TRACK' });
  kr(perf.id, { title: 'p95 page load (ms)', startValue: 2400, targetValue: 1200, currentValue: 2000, unit: 'ms', ownerId: r.bob.id });
  kr(perf.id, { title: 'Lighthouse score', metricType: 'PERCENT', targetValue: 90, startValue: 60, currentValue: 72, unit: '%' });
  const docs = goal({ title: 'Publish API docs', ownerId: r.alice.id, parentId: engGoal.id });
  kr(docs.id, { title: 'Docs site live', metricType: 'BOOLEAN', targetValue: 1, ownerId: r.alice.id });
  kr(docs.id, { title: 'Endpoints documented', targetValue: 40, currentValue: 12 });

  goal({ title: 'Cut infra spend', ownerId: r.admin.id, isCompany: true, timePeriod: year, progressSource: 'MANUAL', manualProgress: 30 });
  const budget = goal({ title: 'Stay within marketing budget', ownerId: r.carol.id, teamId: r.mkt.id, timePeriod: year });
  kr(budget.id, { title: 'Spend', metricType: 'CURRENCY', startValue: 0, targetValue: 50000, currentValue: 18000, unit: 'USD' });

  const ago = (days: number) => new Date(now.getTime() - days * 864e5).toISOString();
  db.goalUpdates!.push(
    { id: uid(db, 'gupd'), goalId: perf.id, authorId: r.bob.id, status: 'AT_RISK', progress: 20, body: 'Bundle split landed; images next.', createdAt: ago(9) },
    { id: uid(db, 'gupd'), goalId: perf.id, authorId: r.bob.id, status: 'OFF_TRACK', progress: 25.6, body: 'Blocked on CDN contract.', createdAt: ago(2) },
    { id: uid(db, 'gupd'), goalId: company.id, authorId: r.admin.id, status: 'ON_TRACK', progress: 30, body: null, createdAt: ago(5) },
  );
}

