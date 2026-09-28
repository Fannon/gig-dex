import { defineConfig, devices } from "@playwright/test";

const base = process.env.VITE_BASE_PATH || "/";
const port = Number(process.env.PLAYWRIGHT_PORT || 5173);
const baseURL = process.env.PLAYWRIGHT_URL || `http://localhost:${port}${base}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./reports/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "./reports/playwright-report" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
