import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.ts",
  fullyParallel: false,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel: "msedge",
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      QUOTE_DB_PATH: `.artifacts/browser-${Date.now()}.sqlite`,
      AXIS_BASE_URL: "",
      AXIS_USERNAME: "",
      AXIS_PASSWORD: "",
    },
  },
});
