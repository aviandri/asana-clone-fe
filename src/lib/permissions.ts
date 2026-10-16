import type { Project, User } from '@/api/types';

/** SPEC §4: anyone who can see a project can edit its content, except COMMENTER members. */
export function canEditProjectContent(project: Pick<Project, 'myRole'> | null | undefined, user: Pick<User, 'role'>) {
  if (user.role === 'ADMIN') return true;
  return project?.myRole !== 'COMMENTER';
}

/** SPEC §4: project settings are for the project OWNER or an ADMIN. */
export function canManageProject(project: Pick<Project, 'myRole'> | null | undefined, user: Pick<User, 'role'>) {
  return user.role === 'ADMIN' || project?.myRole === 'OWNER';
}
