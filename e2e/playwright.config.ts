import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against a running stack. Prereqs (see e2e/README.md):
 *   - backend on :3000 with seed data (`npm run seed` in asana-clone-be)
 *   - frontend: either set E2E_BASE_URL (e.g. the compose stack on :8080), or let this config
 *     start `vite` on :5173 (which proxies /api to :3000).
 * The dev box is RAM-constrained: chromium only, one worker, no retries locally.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --strictPort',
        cwd: '..',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
