import { defineConfig, devices } from "@playwright/test";

const serverPort = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: process.env.CI
    ? {
        command: `npx cross-env PORT=${serverPort} npm run start`,
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: false
      }
    : undefined
});
