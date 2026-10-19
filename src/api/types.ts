// Response/request shapes from docs/SPEC.md §5–6. Keep in sync with the BE contract.

/** Role in the current workspace (SPEC §12). */
export type WorkspaceRole = 'ADMIN' | 'MEMBER' | 'GUEST';
export type Role = WorkspaceRole;
export type Privacy = 'PUBLIC' | 'TEAM' | 'PRIVATE';
export type ProjectView = 'LIST' | 'BOARD' | 'CALENDAR';
export type ProjectRole = 'OWNER' | 'EDITOR' | 'COMMENTER';
export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type NotificationType = 'ASSIGNED' | 'COMMENTED' | 'COMPLETED' | 'MENTIONED';
export type ActivityType =
  | 'CREATED'
  | 'COMPLETED'
  | 'REOPENED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'DUE_DATE_CHANGED'
  | 'MOVED_SECTION'
  | 'RENAMED'
  | 'PRIORITY_CHANGED'
  | 'DESCRIPTION_CHANGED'
  | 'ATTACHMENT_ADDED'
  | 'ATTACHMENT_REMOVED';

export type UserSummary = { id: string; name: string; email: string; avatarColor: string };
/** `GET /users` items: a summary plus the person's role in the current workspace (SPEC §12 W8). */
export type PickableUser = UserSummary & { role: WorkspaceRole };
/** `role` is the role in the *current* workspace; for /admin/users `isActive` is the membership. */
export type User = UserSummary & { role: Role; isActive: boolean; createdAt: string };

// ---- Workspaces (SPEC §12, v1.2) ----

export type Workspace = {
  id: string;
  name: string;
  isOrganization: boolean;
  domain: string | null;
  color: string;
  myRole: WorkspaceRole;
  /** active members incl. guests */
  memberCount: number;
  createdAt: string;
};
export type WorkspaceRef = { id: string; name: string; color: string };
/** `workspaces` are sorted by name. */
export type Me = User & { currentWorkspace: Workspace | null; workspaces: Workspace[] };
export type PendingInvite = {
  id: string;
  workspace: WorkspaceRef;
  role: WorkspaceRole;
  invitedBy: UserSummary;
  expiresAt: string;
};
export type JoinableWorkspace = WorkspaceRef & { memberCount: number };
export type InviteInfo = { id: string; email: string; role: WorkspaceRole; workspace: WorkspaceRef; existingUser: boolean };

export type Team = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
};
export type TeamDetail = Team & { members: UserSummary[] };

export type Section = { id: string; projectId: string; name: string; position: number };

export type Project = {
  id: string;
  workspaceId: string;
  teamId: string;
  name: string;
  description: string | null;
  color: string;
  privacy: Privacy;
  archived: boolean;
  defaultView: ProjectView;
  owner: UserSummary;
  createdAt: string;
  updatedAt: string;
  /** null = access via team/public */
  myRole: ProjectRole | null;
};
export type ProjectMember = { user: UserSummary; role: ProjectRole };
export type ProjectDetail = Project & {
  sections: Section[];
  members: ProjectMember[];
  team: { id: string; name: string };
};

export type TaskProjectRef = { id: string; name: string; color: string };

export type Task = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  sectionId: string | null;
  parentId: string | null;
  title: string;
  description: string | null;
  assignee: UserSummary | null;
  creator: UserSummary;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** YYYY-MM-DD */
  startDate: string | null;
  priority: Priority;
  completed: boolean;
  completedAt: string | null;
  position: number;
  subtaskCount: number;
  completedSubtaskCount: number;
  commentCount: number;
  /** non-draft attachments, task-level and in comments (SPEC §13) */
  attachmentCount: number;
  project: TaskProjectRef | null;
  createdAt: string;
  updatedAt: string;
};
export type TaskDetail = Task & {
  followers: UserSummary[];
  subtasks: Task[];
  parent: { id: string; title: string } | null;
  /** non-draft, task-level and comment ones, newest first (SPEC §13) */
  attachments: Attachment[];
};

// ---- Attachments & links (SPEC §13, v1.3) ----

/** Open enum: unknown kinds are shown generically. */
export type AttachmentKind = 'FILE' | 'LINK' | (string & {});
export type LinkPreviewStatus = 'PENDING' | 'READY' | 'FAILED';

export type Attachment = {
  id: string;
  workspaceId: string;
  taskId: string;
  commentId: string | null;
  kind: AttachmentKind;
  draft: boolean;
  uploader: UserSummary;
  createdAt: string;
  // FILE (null for LINK)
  name: string | null;
  /** server-sniffed */
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  hasThumbnail: boolean;
  // LINK (null for FILE)
  url: string | null;
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** open string: unknown providers get the generic icon */
  provider: string | null;
  previewStatus: LinkPreviewStatus | null;
  hasIcon: boolean;
  hasImage: boolean;
  /** Relative paths from the server; never built by hand. */
  contentPath: string | null;
  thumbnailPath: string | null;
};

export type CommentStory = {
  kind: 'comment';
  id: string;
  author: UserSummary;
  body: string;
  createdAt: string;
  editedAt: string | null;
};
export type ActivityStory = {
  kind: 'activity';
  id: string;
  actor: UserSummary;
  type: ActivityType | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  createdAt: string;
};
export type Story = CommentStory | ActivityStory;

export type Notification = {
  id: string;
  workspaceId: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor: UserSummary;
  task: { id: string; title: string; projectId: string | null } | null;
};

export type Invite = {
  id: string;
  workspaceId: string;
  email: string;
  role: Role;
  token: string;
  inviteUrl: string;
  expiresAt: string;
  createdAt: string;
  invitedBy?: UserSummary;
};

export type ListResponse<T> = { data: T[] };
export type NotificationsResponse = { data: Notification[]; unreadCount: number };
export type SearchResponse = { tasks: Task[]; projects: Project[]; users: UserSummary[] };

export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'GONE'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL';
export type ErrorBody = { error: { code: ErrorCode; message: string; details?: unknown } };

// ---- Request bodies ----

export type CreateProjectInput = {
  teamId: string;
  name: string;
  description?: string;
  color?: string;
  privacy?: Privacy;
  defaultView?: ProjectView;
};
export type UpdateProjectInput = Partial<{
  name: string;
  description: string | null;
  color: string;
  privacy: Privacy;
  archived: boolean;
  defaultView: ProjectView;
}>;

export type CreateTaskInput = {
  title: string;
  projectId?: string | null;
  sectionId?: string | null;
  parentId?: string | null;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  priority?: Priority;
  position?: number;
};
export type UpdateTaskInput = Partial<{
  title: string;
  description: string | null;
  projectId: string | null;
  sectionId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  startDate: string | null;
  priority: Priority;
  completed: boolean;
  position: number;
}>;

// ---- Goals / OKRs (SPEC §10, v1.1) ----

export type GoalStatus =
  | 'NO_STATUS'
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'OFF_TRACK'
  | 'ACHIEVED'
  | 'PARTIAL'
  | 'MISSED'
  | 'DROPPED';
export type ProgressSource = 'KEY_RESULTS' | 'SUB_GOALS' | 'PROJECTS' | 'MANUAL';
export type MetricType = 'NUMBER' | 'PERCENT' | 'CURRENCY' | 'BOOLEAN';

export type Goal = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  owner: UserSummary;
  team: { id: string; name: string } | null;
  isCompany: boolean;
  parentId: string | null;
  /** `YYYY` | `YYYY-H1|H2` | `YYYY-Q1..Q4` */
  timePeriod: string;
  status: GoalStatus;
  progressSource: ProgressSource;
  /** 0–100, computed by the server */
  progress: number;
  weight: number;
  keyResultCount: number;
  childCount: number;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
};

export type KeyResult = {
  id: string;
  goalId: string;
  title: string;
  metricType: MetricType;
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  owner: UserSummary | null;
  progress: number;
  position: number;
  updatedAt: string;
};

export type GoalUpdate = {
  id: string;
  goalId: string;
  author: UserSummary;
  status: GoalStatus;
  progress: number;
  body: string | null;
  createdAt: string;
};

export type GoalDetail = Goal & {
  parent: { id: string; title: string } | null;
  keyResults: KeyResult[];
  children: Goal[];
  projects: { project: TaskProjectRef; total: number; completed: number }[];
  hiddenProjectCount: number;
  latestUpdate: GoalUpdate | null;
};

export type CreateGoalInput = {
  title: string;
  timePeriod: string;
  description?: string | null;
  ownerId?: string;
  teamId?: string | null;
  isCompany?: boolean;
  parentId?: string | null;
  progressSource?: ProgressSource;
  weight?: number;
};
export type UpdateGoalInput = Partial<{
  title: string;
  description: string | null;
  ownerId: string;
  teamId: string | null;
  isCompany: boolean;
  parentId: string | null;
  timePeriod: string;
  status: GoalStatus;
  progressSource: ProgressSource;
  manualProgress: number;
  weight: number;
}>;
export type CreateKeyResultInput = {
  title: string;
  metricType: MetricType;
  startValue?: number;
  targetValue: number;
  currentValue?: number;
  unit?: string | null;
  ownerId?: string | null;
  position?: number;
};
export type UpdateKeyResultInput = Partial<CreateKeyResultInput>;

// ---- Reporting (SPEC §11, v1.1) ----

export type Counts = { total: number; completed: number; incomplete: number; overdue: number };

export type ProjectReport = {
  project: TaskProjectRef;
  totals: Counts & { unassigned: number; percentComplete: number };
  bySection: { sectionId: string | null; name: string; total: number; completed: number; overdue: number }[];
  byAssignee: { assignee: UserSummary | null; incomplete: number; completed: number; overdue: number }[];
  byPriority: { priority: Priority; total: number; incomplete: number }[];
  /** oldest → newest; `open` = incomplete at week end */
  trend: { weekStart: string; created: number; completed: number; open: number }[];
  upcoming: Task[];
};

export type OverviewReport = {
  totals: Counts & { projects: number };
  projects: (Counts & { project: Project; percentComplete: number; lastActivityAt: string | null })[];
};

export type WorkloadReport = {
  from: string;
  to: string;
  data: { user: UserSummary; open: number; overdue: number; dueInRange: number; completedInRange: number }[];
};
