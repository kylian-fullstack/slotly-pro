import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:31987",
    trace: "on-first-retry"
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: "pnpm --filter @slotly/web dev --hostname 127.0.0.1 --port 31987",
    url: "http://127.0.0.1:31987",
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://slotly:slotly_local_only@127.0.0.1:45432/slotly_dev",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "playwright-only-session-secret-at-least-32-characters",
      PUBLIC_REGISTRATION_ENABLED: "true", TEST_SEED_ENABLED: "false", RATE_LIMIT_BACKEND: "memory",
      APP_ORIGIN: "http://127.0.0.1:31987"
    }
  }
});
