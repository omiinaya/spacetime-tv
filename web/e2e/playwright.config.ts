import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "e2e/**/*.spec.ts",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 60_000,
  use: {
    // Backend serves the frontend (built dist) at :8720.
    // For vite dev mode, use the vite dev server port instead.
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:8720",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
    {
      name: "Mobile Chrome",
      use: {
        browserName: "chromium",
        ...devices["Pixel 5"],
      },
    },
    {
      name: "Mobile Safari",
      use: {
        browserName: "webkit",
        ...devices["iPhone 13"],
      },
    },
    {
      name: "Tablet",
      use: {
        browserName: "chromium",
        ...devices["iPad (gen 7)"],
      },
    },
  ],
});
