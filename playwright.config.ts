import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["browser.spec.ts", "api.spec.ts"],
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
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
  webServer: [{
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/api/quotes",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      QUOTE_DB_PATH: `.artifacts/browser-${Date.now()}.sqlite`,
      QUOTE_API_KEY: "test-only-api-key-with-at-least-32-characters",
      QUOTE_API_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      AXIS_BASE_URL: "",
      AXIS_USERNAME: "",
      AXIS_PASSWORD: "",
    },
  }, {
    command: "node tests/partner-client.mjs",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  }],
});
