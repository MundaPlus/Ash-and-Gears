import { defineConfig, devices } from "@playwright/test";

// Runs against the production preview build. The server binds 0.0.0.0 like the dev server.
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "artifacts/e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
