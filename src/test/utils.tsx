import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { setFetch } from '@/api/client';
import { routes } from '@/routes';
import { createQueryClient } from '@/lib/queryClient';
import { createMockFetch } from '@/mocks/backend';
import { createSeedDb, type MockDb } from '@/mocks/db';

export const ADMIN = 'admin@example.com';
export const ALICE = 'alice@example.com';
export const BOB = 'bob@example.com';

/** Fresh seeded mock backend wired into the API client. Optionally pre-logged-in. */
export function setupMockApi(loginAs?: string) {
  const db: MockDb = createSeedDb();
  if (loginAs) db.sessionUserId = db.users.find((u) => u.email === loginAs)!.id;
  setFetch(createMockFetch(() => db));
  return db;
}

/** The app's real client (incl. global mutation error toasts) with test-friendly defaults. */
export function createTestQueryClient() {
  const qc = createQueryClient();
  qc.setDefaultOptions({
    queries: { retry: false, staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false },
    mutations: { retry: false },
  });
  return qc;
}

/** Render the whole app (real routes) at `path` against the mock backend. */
export function renderApp(path: string, opts: { loginAs?: string; db?: MockDb } = {}) {
  const db = opts.db ?? setupMockApi(opts.loginAs);
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, db, router, queryClient };
}
