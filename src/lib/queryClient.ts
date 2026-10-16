import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { errorMessage } from './errors';
import { showToast } from './toast';

export function createQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (err, variables) => {
        // Callers that render the error inline pass `quiet: true` in the variables.
        if ((variables as { quiet?: boolean } | undefined)?.quiet) return;
        if (err instanceof ApiError && err.status === 401) return; // handled by auth
        showToast(errorMessage(err));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
