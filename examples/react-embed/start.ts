/**
 * One-command runner for the react-embed example: boots a throwaway standalone
 * panel (memory storage, no auth, mounted at /flags), seeds it with the demo
 * dataset, then starts the Vite dev server whose proxy forwards /flags to it.
 *
 *   bun run start          # → http://localhost:5189 (vite) + panel on :3700
 *   # or from the repo root: bun run examples:react-embed
 *
 * Ctrl-C stops both. Nothing is persisted.
 */

const PANEL_PORT = "3700"; // must match the proxy target in vite.config.ts
const VITE_PORT = process.env.PORT ?? "5189";
const PANEL_BASE = `http://localhost:${PANEL_PORT}/flags`;

const panel = Bun.spawn(["bun", "../../apps/standalone/src/index.ts"], {
  env: {
    ...process.env,
    PORT: PANEL_PORT,
    BASE_PATH: "/flags",
    AUTH_MODE: "none",
    SOURCE_STORAGE_DRIVER: "memory",
    RUNTIME_STORAGE_DRIVER: "memory",
  },
  stdout: "inherit",
  stderr: "inherit",
});

let vite: ReturnType<typeof Bun.spawn> | undefined;
const shutdown = () => {
  vite?.kill();
  panel.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Wait for the panel healthcheck, then seed it with the demo dataset.
const start = Date.now();
while (Date.now() - start < 15_000) {
  try {
    const res = await fetch(`${PANEL_BASE}/healthcheck`);
    if (res.ok) break;
  } catch {
    // not up yet
  }
  await Bun.sleep(200);
}
const seedProc = Bun.spawn(["bun", "run", "seed:demo"], {
  cwd: "../..",
  env: { ...process.env, BASE_URL: PANEL_BASE },
  stdout: "inherit",
  stderr: "inherit",
});
if ((await seedProc.exited) !== 0) {
  console.error("Seeding failed — is the panel up? Continuing with an empty panel.");
}

console.log(`\n▶ react-embed host app → http://localhost:${VITE_PORT} (panel on :${PANEL_PORT})\n`);
vite = Bun.spawn(["bunx", "vite", "--port", VITE_PORT], { stdout: "inherit", stderr: "inherit" });
await vite.exited;
shutdown();
