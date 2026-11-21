import { definePlaywrightConfig } from "@xtandard/kit/build";

/**
 * Browser e2e for the bundled admin UI. Boots the standalone server (memory
 * storage, no auth) after building the UI bundle, then drives the real SPA.
 * Also builds the React embed + a tiny host app (e2e/embed-host) for the embed
 * theme checks, served via request interception on the same origin.
 *
 *   bun run test:e2e
 */
export default definePlaywrightConfig({
  port: 3310,
  serverCmd:
    "bun run build:ui && bun run build:react && bun build e2e/embed-host/main.tsx --outdir e2e/.embed-host && bun run apps/standalone/src/index.ts",
  env: { AUTH_MODE: "none", SOURCE_STORAGE_DRIVER: "memory", RUNTIME_STORAGE_DRIVER: "memory" },
});
