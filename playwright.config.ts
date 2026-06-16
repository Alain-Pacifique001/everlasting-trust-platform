import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config.
 * Set BASE_URL to your preview/published URL before running.
 *   BASE_URL=https://your-preview.lovable.app bunx playwright test
 * Provide two test accounts via env:
 *   E2E_USER_EMAIL / E2E_USER_PASSWORD          (sender)
 *   E2E_USER2_EMAIL / E2E_USER2_PASSWORD        (recipient, for mentions)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
