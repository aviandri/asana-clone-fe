import { API_BASE, http, request } from './client';
import type {
  CreateGoalInput,
  CreateKeyResultInput,
  CreateProjectInput,
  Goal,
  GoalDetail,
  GoalStatus,
  GoalUpdate,
  KeyResult,
  OverviewReport,
  ProjectReport,
  UpdateGoalInput,
  UpdateKeyResultInput,
  WorkloadReport,
  CreateTaskInput,
  Invite,
  InviteInfo,
  JoinableWorkspace,
  ListResponse,
  Me,
  PendingInvite,
  Workspace,
  NotificationsResponse,
  Project,
  ProjectDetail,
  ProjectRole,
  Role,
  SearchResponse,
  Section,
  Story,
  Task,
  TaskDetail,
  Team,
  TeamDetail,
  UpdateProjectInput,
  UpdateTaskInput,
  User,
  UserSummary,
} from './types';

export const authApi = {
  login: (email: string, password: string) => http.post<Me>('/auth/login', { email, password }),
  logout: () => http.post<void>('/auth/logout'),
  /** `workspaceId: null` asks without a header (server picks the last/oldest workspace). */
  me: (opts: { workspaceId?: string | null } = {}) => http.get<Me>('/auth/me', undefined, opts),
  getInvite: (token: string) => http.get<InviteInfo>(`/auth/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string, name: string, password: string) =>
    http.post<Me>('/auth/accept-invite', { token, name, password }),
};

export type UpdateWorkspaceInput = Partial<{ name: string; color: string; isOrganization: boolean; domain: string | null }>;

export const workspacesApi = {
  list: () => http.get<ListResponse<Workspace>>('/workspaces'),
  get: (id: string) => http.get<Workspace>(`/workspaces/${id}`),
  create: (body: { name: string; color?: string }) => http.post<Workspace>('/workspaces', body),
  update: (id: string, body: UpdateWorkspaceInput) =>
    http.patch<Workspace & { convertedToGuests?: number }>(`/workspaces/${id}`, body),
  delete: (id: string, confirmName: string) => request<void>('DELETE', `/workspaces/${id}`, { body: { confirmName } }),
  switch: (id: string) => http.post<Workspace>(`/workspaces/${id}/switch`),
  leave: (id: string) => http.post<void>(`/workspaces/${id}/leave`),
  joinable: () => http.get<ListResponse<JoinableWorkspace>>('/workspaces/joinable'),
  join: (id: string) => http.post<Workspace>(`/workspaces/${id}/join`),
  myInvites: () => http.get<ListResponse<PendingInvite>>('/me/invites'),
  acceptInvite: (id: string) => http.post<Workspace>(`/me/invites/${id}/accept`),
  declineInvite: (id: string) => http.delete(`/me/invites/${id}`),
};

export const usersApi = {
  list: (q?: string) => http.get<ListResponse<UserSummary>>('/users', { q }),
  get: (id: string) => http.get<User>(`/users/${id}`),
  updateMe: (body: {
    name?: string;
    avatarColor?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => http.patch<User>('/users/me', body),
};

export const adminApi = {
  users: () => http.get<ListResponse<User>>('/admin/users'),
  updateUser: (id: string, body: { role?: Role; isActive?: boolean }) =>
    http.patch<User>(`/admin/users/${id}`, body),
  invites: () => http.get<ListResponse<Invite>>('/admin/invites'),
  createInvite: (email: string, role: Role) => http.post<Invite>('/admin/invites', { email, role }),
  deleteInvite: (id: string) => http.delete(`/admin/invites/${id}`),
};

export const teamsApi = {
  list: (mine?: boolean) => http.get<ListResponse<Team>>('/teams', { mine: mine || undefined }),
  get: (id: string) => http.get<TeamDetail>(`/teams/${id}`),
  create: (body: { name: string; description?: string }) => http.post<TeamDetail>('/teams', body),
  update: (id: string, body: { name?: string; description?: string | null }) =>
    http.patch<TeamDetail>(`/teams/${id}`, body),
  delete: (id: string) => http.delete(`/teams/${id}`),
  addMember: (id: string, userId: string) =>
    http.post<TeamDetail>(`/teams/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) =>
    http.delete<TeamDetail>(`/teams/${id}/members/${userId}`),
};

export const projectsApi = {
  list: (query: { teamId?: string; archived?: boolean; q?: string } = {}) =>
    http.get<ListResponse<Project>>('/projects', query),
  get: (id: string) => http.get<ProjectDetail>(`/projects/${id}`),
  create: (body: CreateProjectInput) => http.post<ProjectDetail>('/projects', body),
  update: (id: string, body: UpdateProjectInput) => http.patch<ProjectDetail>(`/projects/${id}`, body),
  delete: (id: string) => http.delete(`/projects/${id}`),
  addMember: (id: string, userId: string, role: ProjectRole) =>
    http.post<ProjectDetail>(`/projects/${id}/members`, { userId, role }),
  updateMember: (id: string, userId: string, role: ProjectRole) =>
    http.patch<ProjectDetail>(`/projects/${id}/members/${userId}`, { role }),
  removeMember: (id: string, userId: string) =>
    http.delete<ProjectDetail>(`/projects/${id}/members/${userId}`),
  tasks: (id: string, query: { completed?: boolean; assigneeId?: string } = {}) =>
    http.get<ListResponse<Task>>(`/projects/${id}/tasks`, query),
};

export const sectionsApi = {
  create: (projectId: string, body: { name: string; position?: number }) =>
    http.post<Section>(`/projects/${projectId}/sections`, body),
  update: (id: string, body: { name?: string; position?: number }) =>
    http.patch<Section>(`/sections/${id}`, body),
  delete: (id: string) => http.delete(`/sections/${id}`),
};

export const tasksApi = {
  mine: (query: { completed?: boolean } = {}) => http.get<ListResponse<Task>>('/me/tasks', query),
  create: (body: CreateTaskInput) => http.post<TaskDetail>('/tasks', body),
  get: (id: string) => http.get<TaskDetail>(`/tasks/${id}`),
  update: (id: string, body: UpdateTaskInput) => http.patch<TaskDetail>(`/tasks/${id}`, body),
  delete: (id: string) => http.delete(`/tasks/${id}`),
  addFollower: (id: string, userId: string) =>
    http.post<TaskDetail>(`/tasks/${id}/followers`, { userId }),
  removeFollower: (id: string, userId: string) =>
    http.delete<TaskDetail>(`/tasks/${id}/followers/${userId}`),
  stories: (id: string) => http.get<ListResponse<Story>>(`/tasks/${id}/stories`),
  addComment: (id: string, body: string) => http.post<Story>(`/tasks/${id}/comments`, { body }),
};

export const commentsApi = {
  update: (id: string, body: string) => http.patch<Story>(`/comments/${id}`, { body }),
  delete: (id: string) => http.delete(`/comments/${id}`),
};

export const notificationsApi = {
  list: (query: { unread?: boolean; limit?: number } = {}, opts: { workspaceId?: string } = {}) =>
    http.get<NotificationsResponse>('/notifications', query, opts),
  markRead: (id: string) => http.post<void>(`/notifications/${id}/read`),
  markAllRead: () => http.post<void>('/notifications/read-all'),
};

export const searchApi = {
  search: (q: string) => http.get<SearchResponse>('/search', { q }),
};

export const goalsApi = {
  list: (query: { timePeriod?: string; teamId?: string; ownerId?: string; company?: boolean; q?: string } = {}) =>
    http.get<ListResponse<Goal>>('/goals', query),
  timePeriods: () => http.get<ListResponse<string>>('/goals/time-periods'),
  get: (id: string) => http.get<GoalDetail>(`/goals/${id}`),
  create: (body: CreateGoalInput) => http.post<GoalDetail>('/goals', body),
  update: (id: string, body: UpdateGoalInput) => http.patch<GoalDetail>(`/goals/${id}`, body),
  delete: (id: string) => http.delete(`/goals/${id}`),
  addKeyResult: (id: string, body: CreateKeyResultInput) => http.post<KeyResult>(`/goals/${id}/key-results`, body),
  updateKeyResult: (krId: string, body: UpdateKeyResultInput) => http.patch<KeyResult>(`/key-results/${krId}`, body),
  deleteKeyResult: (krId: string) => http.delete(`/key-results/${krId}`),
  linkProject: (id: string, projectId: string) => http.post<GoalDetail>(`/goals/${id}/projects`, { projectId }),
  unlinkProject: (id: string, projectId: string) => http.delete<GoalDetail>(`/goals/${id}/projects/${projectId}`),
  updates: (id: string) => http.get<ListResponse<GoalUpdate>>(`/goals/${id}/updates`),
  postUpdate: (id: string, body: { status: GoalStatus; body?: string | null }) =>
    http.post<GoalUpdate>(`/goals/${id}/updates`, body),
};

export const reportsApi = {
  project: (id: string, weeks = 12) => http.get<ProjectReport>(`/projects/${id}/report`, { weeks }),
  overview: (teamId?: string) => http.get<OverviewReport>('/reports/overview', { teamId }),
  workload: (query: { teamId?: string; from?: string; to?: string } = {}) =>
    http.get<WorkloadReport>('/reports/workload', query),
  /** Plain link (cookie-authenticated download), not fetched via JS. */
  projectCsvUrl: (id: string) => `${API_BASE}/projects/${id}/tasks.csv`,
};
