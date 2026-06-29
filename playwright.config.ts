import { defineConfig, devices } from "@playwright/test";

const PORT = 3310;

/**
 * Browser e2e for the bundled admin UI. Boots the standalone server (memory
 * storage, no auth) after building the UI bundle, then drives the real SPA.
 *
 *   bun run test:e2e
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bun run build:ui && PORT=${PORT} AUTH_MODE=none SOURCE_STORAGE_DRIVER=memory RUNTIME_STORAGE_DRIVER=memory bun run apps/standalone/src/index.ts`,
    url: `http://localhost:${PORT}/healthcheck`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
