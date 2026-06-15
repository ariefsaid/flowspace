import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // The single `next start` server wedges under parallel load (false failures
  // observed in review), so run serially with one worker.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Task 7.2: enable webServer for e2e runs.
  // Pre-requisites: `pnpm db:deploy && pnpm db:seed` against the e2e DB, and NEXTAUTH_SECRET set.
  // AUTH_TRUST_HOST=true is required for NextAuth v5 in production mode on localhost (non-HTTPS).
  // reuseExistingServer: true locally so an already-running server is reused.
  webServer: {
    command: "AUTH_TRUST_HOST=true pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      AUTH_TRUST_HOST: "true",
    },
  },
});
