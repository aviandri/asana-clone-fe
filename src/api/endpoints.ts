import { http } from './client';
import type {
  CreateProjectInput,
  CreateTaskInput,
  Invite,
  ListResponse,
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
  login: (email: string, password: string) => http.post<User>('/auth/login', { email, password }),
  logout: () => http.post<void>('/auth/logout'),
  me: () => http.get<User>('/auth/me'),
  getInvite: (token: string) =>
    http.get<{ email: string; role: Role }>(`/auth/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string, name: string, password: string) =>
    http.post<User>('/auth/accept-invite', { token, name, password }),
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
  list: (query: { unread?: boolean; limit?: number } = {}) =>
    http.get<NotificationsResponse>('/notifications', query),
  markRead: (id: string) => http.post<void>(`/notifications/${id}/read`),
  markAllRead: () => http.post<void>('/notifications/read-all'),
};

export const searchApi = {
  search: (q: string) => http.get<SearchResponse>('/search', { q }),
};
