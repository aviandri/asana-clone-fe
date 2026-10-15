import { useQuery } from '@tanstack/react-query';
import { notificationsApi, projectsApi, teamsApi } from './endpoints';
import { qk } from './queryKeys';

export function useTeams() {
  return useQuery({ queryKey: qk.teams(), queryFn: () => teamsApi.list().then((r) => r.data) });
}

export function useProjects(filters: { teamId?: string; archived?: boolean } = { archived: false }) {
  return useQuery({
    queryKey: qk.projects(filters),
    queryFn: () => projectsApi.list(filters).then((r) => r.data),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: qk.project(id ?? ''),
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => notificationsApi.list({ limit: 50 }),
    // No websockets in v1 — poll for new notifications.
    refetchInterval: 60_000,
  });
}
