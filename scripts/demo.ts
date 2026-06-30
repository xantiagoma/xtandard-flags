/**
 * One-command demo: boot a throwaway standalone server (in-memory, no auth) and
 * seed it with a complete dataset, then keep it running so you can browse.
 *
 *   bun run demo            # → http://localhost:7788
 *   PORT=3000 bun run demo
 *
 * Ctrl-C stops the server. Nothing is persisted (memory storage).
 *
 * @module
 */

import { seed } from "./seed-demo.ts";

const PORT = process.env.PORT ?? "7788";
const BASE = `http://localhost:${PORT}`;

const server = Bun.spawn(["bun", "apps/standalone/src/index.ts"], {
  env: {
    ...process.env,
    PORT,
    AUTH_MODE: "none",
    SOURCE_STORAGE_DRIVER: "memory",
    RUNTIME_STORAGE_DRIVER: "memory",
  },
  stdout: "inherit",
  stderr: "inherit",
});

const shutdown = () => {
  server.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Wait for the healthcheck before seeding.
async function waitForServer(timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/healthcheck`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(200);
  }
  throw new Error(`server did not become ready at ${BASE} within ${timeoutMs}ms`);
}

try {
  await waitForServer();
  await seed(BASE);
  console.log("\nDemo server running — press Ctrl-C to stop.\n");
} catch (err) {
  console.error("Demo failed:", err instanceof Error ? err.message : err);
  server.kill();
  process.exit(1);
}

// Keep the process alive alongside the server.
await server.exited;
