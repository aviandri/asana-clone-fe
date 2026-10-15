// In-memory data store for the mock backend. Rows mirror the Prisma model in docs/SPEC.md §3.
import { addDays, format } from 'date-fns';
import type {
  NotificationType,
  Priority,
  Privacy,
  ProjectRole,
  ProjectView,
  Role,
} from '@/api/types';

export type UserRow = {
  id: string;
  email: string;
  name: string;
  password: string;
  role: Role;
  isActive: boolean;
  avatarColor: string;
  createdAt: string;
};
export type InviteRow = {
  id: string;
  email: string;
  role: Role;
  token: string;
  invitedById: string;
  expiresAt: string;
  acceptedAt: string | null;
};
export type TeamRow = { id: string; name: string; description: string | null; createdAt: string };
export type TeamMemberRow = { teamId: string; userId: string };
export type ProjectRow = {
  id: string;
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
  userId: string;
  actorId: string;
  taskId: string | null;
  type: NotificationType;
  read: boolean;
  createdAt: string;
};

export type MockDb = {
  /** userId of the "cookie" session, or null when logged out */
  sessionUserId: string | null;
  seq: number;
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

  const mkUser = (name: string, email: string, role: Role, avatarColor: string) => {
    const u: UserRow = {
      id: uid(db, 'user'),
      email,
      name,
      password: 'password123',
      role,
      isActive: true,
      avatarColor,
      createdAt: now,
    };
    db.users.push(u);
    return u;
  };
  const admin = mkUser('Ada Admin', 'admin@example.com', 'ADMIN', '#8d84e8');
  const alice = mkUser('Alice Anderson', 'alice@example.com', 'MEMBER', '#4ecbc4');
  const bob = mkUser('Bob Brown', 'bob@example.com', 'MEMBER', '#f1bd6c');
  const carol = mkUser('Carol Chen', 'carol@example.com', 'MEMBER', '#e362e3');

  const mkTeam = (name: string, description: string, members: UserRow[]) => {
    const t: TeamRow = { id: uid(db, 'team'), name, description, createdAt: now };
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
      teamId: team.id,
      ownerId: owner.id,
      name,
      description: `${name} — tracked in the Asana clone.`,
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
      userId: admin.id,
      actorId: alice.id,
      taskId: t1.id,
      type: 'MENTIONED',
      read: false,
      createdAt: now,
    },
    {
      id: uid(db, 'ntfy'),
      userId: admin.id,
      actorId: carol.id,
      taskId: db.tasks.find((t) => t.title === 'Landing page A/B test')!.id,
      type: 'ASSIGNED',
      read: false,
      createdAt: now,
    },
  );

  return db;
}
