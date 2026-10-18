import { request, type FullConfig } from '@playwright/test';
import { ADMIN } from './fixtures';
import { STORAGE_STATE } from './paths';

/**
 * Log in once per run and save the session cookie. The BE rate-limits POST /auth/login
 * (AUTH_RATE_LIMIT_MAX, default 10/min per IP), so per-test logins would 429 on quick reruns.
 */
export default async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post('/api/v1/auth/login', { data: ADMIN });
  if (!res.ok()) {
    throw new Error(`Seed admin login failed (${res.status()}): ${await res.text()}. Is the BE running and seeded?`);
  }
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
}
