import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright scaffold for Phase 0+ E2E tests.
 * Full E2E coverage begins in later phases.
 *
 * Run: npm run test:e2e
 * Requires browser install: npx playwright install
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      MONGODB_URI:
        process.env.MONGODB_URI ?? "mongodb://localhost:27017/evocrm_e2e",
      NEXTAUTH_URL: "http://localhost:3000",
      NEXTAUTH_SECRET: "e2e-test-secret",
      CRON_SECRET: "e2e-cron-secret",
    },
  },
});
