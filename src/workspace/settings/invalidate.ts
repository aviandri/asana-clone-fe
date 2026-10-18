import type { QueryClient } from '@tanstack/react-query';
import { qk } from '@/api/queryKeys';

/**
 * After a membership change (role change, deactivation, organization conversion): becoming a guest
 * drops team memberships and can move project ownership (SPEC §12 W4/W7), so refetch everything that
 * shows people, teams or project members — not just the members table.
 */
export function invalidateMembershipViews(qc: QueryClient) {
  for (const key of [qk.adminUsers, qk.adminInvites, ['users'], ['teams'], ['team'], ['projects'], ['project'], qk.me]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}
