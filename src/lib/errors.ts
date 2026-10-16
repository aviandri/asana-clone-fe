import { ApiError } from '@/api/client';

/** User-facing message for an API error, with friendlier copy for common cases. */
export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) {
    if (err.status === 429 || err.code === 'RATE_LIMITED') return 'Too many attempts — please try again shortly.';
    return err.message || fallback;
  }
  return err instanceof Error ? err.message : fallback;
}
