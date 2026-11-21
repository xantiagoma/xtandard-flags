/**
 * Standalone `@xtandard/flags` server — what the Docker image runs.
 *
 * Delegates to the CLI's `serve` command (panel + API + OFREP, all configured
 * via environment variables, `/healthcheck` included), overriding only the
 * defaults the image has always had: both storage planes default to `memory`
 * (ephemeral demo mode) where the bare CLI defaults to `file`, and file/SQLite
 * data lives under `./data/` rather than `./.flags/`.
 */

// In-repo app: imports the library from source (Bun runs TS directly), so the
// Docker image needs no compiled lib — only the UI bundle (dist/ui). Published
// consumers import from "@xtandard/flags/*"; see examples/ for that usage.
for (const role of ["SOURCE", "RUNTIME"] as const) {
  const r = role.toLowerCase();
  process.env[`${role}_STORAGE_DRIVER`] ||= "memory";
  process.env[`${role}_FILE_DIR`] ||= `./data/${r}`;
  process.env[`${role}_SQLITE_PATH`] ||= `./data/${r}.sqlite`;
}

const { run } = await import("../../../src/cli.ts");

run(["serve"]).then(
  (code) => process.exit(code),
  (err) => {
    console.error("[xtandard/flags] failed to start:", err);
    process.exit(1);
  },
);
