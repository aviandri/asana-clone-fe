import type { Workspace, WorkspaceRole } from '@/api/types';

export const ROLE_LABEL: Record<WorkspaceRole, string> = { ADMIN: 'Admin', MEMBER: 'Member', GUEST: 'Guest' };

/** In an organization, people off its domain can only be guests (SPEC §12). */
export const isExternal = (ws: Pick<Workspace, 'isOrganization' | 'domain'>, email: string) =>
  ws.isOrganization && !!ws.domain && !email.toLowerCase().endsWith(`@${ws.domain}`);
