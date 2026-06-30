import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.ts";

let dir: string;
let out: string[];
let err: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flags-cli-"));
  process.env.SOURCE_STORAGE_DRIVER = "file";
  process.env.RUNTIME_STORAGE_DRIVER = "file";
  process.env.SOURCE_FILE_DIR = join(dir, "src");
  process.env.RUNTIME_FILE_DIR = join(dir, "rt");
  out = [];
  err = [];
  vi.spyOn(process.stdout, "write").mockImplementation((s) => (out.push(String(s)), true));
  vi.spyOn(process.stderr, "write").mockImplementation((s) => (err.push(String(s)), true));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.SOURCE_STORAGE_DRIVER;
  delete process.env.RUNTIME_STORAGE_DRIVER;
  delete process.env.SOURCE_FILE_DIR;
  delete process.env.RUNTIME_FILE_DIR;
});

describe("cli", () => {
  test("help exits 0 with --help, 1 with no command", async () => {
    expect(await run(["--help"])).toBe(0);
    expect(await run([])).toBe(1);
  });

  test("--help documents serve, STREAMING, and the global flags", async () => {
    expect(await run(["--help"])).toBe(0);
    const help = out.join("");
    for (const token of ["serve", "STREAMING", "-v, --version", "AUTH_MODE", "Examples:"]) {
      expect(help).toContain(token);
    }
  });

  test("--version / -v print a semver and exit 0; inspect --version is unaffected", async () => {
    expect(await run(["--version"])).toBe(0);
    expect(out.join("")).toMatch(/\d+\.\d+\.\d+/);
    out.length = 0;
    expect(await run(["-v"])).toBe(0);
    expect(out.join("")).toMatch(/\d+\.\d+\.\d+/);
    out.length = 0;
    // `inspect --version v2` takes a value — must NOT print the CLI version.
    expect(await run(["inspect", "--version", "v2"])).toBe(1); // no such snapshot
    expect(err.join("")).toContain('Snapshot "v2" not found');
  });

  test("init → validate → publish → inspect round-trip", async () => {
    expect(await run(["init"])).toBe(0);
    expect(await run(["validate"])).toBe(0);
    expect(await run(["publish", "--message", "first"])).toBe(0);
    expect(out.join("")).toContain("Published v1");
    out.length = 0;
    expect(await run(["inspect"])).toBe(0);
    expect(out.join("")).toContain('"version": "v1"');
  });

  test("rollback without version exits 1", async () => {
    expect(await run(["rollback"])).toBe(1);
    expect(err.join("")).toContain("Usage");
  });

  test("inspect with no active snapshot exits 1", async () => {
    expect(await run(["inspect"])).toBe(1);
  });

  test("unknown command exits 1", async () => {
    expect(await run(["frobnicate"])).toBe(1);
    expect(err.join("")).toContain("Unknown command");
  });

  test("help command exits 0 and prints usage", async () => {
    expect(await run(["help"])).toBe(0);
    expect(out.join("")).toContain("xtandard-flags");
  });

  test("list with an empty draft says so", async () => {
    expect(await run(["init"])).toBe(0);
    out.length = 0;
    expect(await run(["list"])).toBe(0);
    expect(out.join("")).toContain("No flags in draft.");
  });

  test("list renders flags after a draft is written", async () => {
    await run(["init"]);
    // The CLI has no create-flag command, so populate the draft via the same
    // file storage the CLI uses (see writeFlag below).
    await writeFlag("dark-mode", true);
    out.length = 0;
    expect(await run(["list"])).toBe(0);
    const text = out.join("");
    expect(text).toContain("dark-mode");
    expect(text).toContain("(boolean)");
    expect(text).toContain("●"); // enabled marker
  });

  test("validate reports an invalid draft and exits 1", async () => {
    await writeInvalidFlag("broken");
    expect(await run(["validate"])).toBe(1);
    expect(err.join("")).toContain("INVALID");
  });

  test("eval with --key, --context, and default source", async () => {
    await writeFlag("dark-mode", true);
    out.length = 0;
    expect(await run(["eval", "--key", "dark-mode", "--context", '{"targetingKey":"u1"}'])).toBe(0);
    expect(out.join("")).toContain("dark-mode = true");
  });

  test("eval with invalid --context JSON exits 1", async () => {
    await writeFlag("dark-mode", true);
    err.length = 0;
    expect(await run(["eval", "--context", "{not json"])).toBe(1);
    expect(err.join("")).toContain("Invalid --context JSON");
  });

  test("eval --source active reads the published snapshot", async () => {
    await writeFlag("dark-mode", true);
    await run(["publish"]);
    out.length = 0;
    expect(await run(["eval", "--source", "active"])).toBe(0);
    expect(out.join("")).toContain("dark-mode = true");
  });

  test("inspect --version reads a specific snapshot, and a missing one exits 1", async () => {
    await writeFlag("dark-mode", true);
    await run(["publish"]);
    out.length = 0;
    expect(await run(["inspect", "--version", "v1"])).toBe(0);
    expect(out.join("")).toContain('"version": "v1"');
    err.length = 0;
    expect(await run(["inspect", "--version", "v404"])).toBe(1);
    expect(err.join("")).toContain("not found");
  });

  test("rollback to an existing version succeeds", async () => {
    await writeFlag("dark-mode", true);
    await run(["publish"]); // v1
    await writeFlag("other", false);
    await run(["publish"]); // v2
    out.length = 0;
    expect(await run(["rollback", "v1"])).toBe(0);
    expect(out.join("")).toContain("Rolled back to v1");
  });

  test("rollback to a missing version exits 1 (mapped error)", async () => {
    await run(["init"]);
    err.length = 0;
    expect(await run(["rollback", "v99"])).toBe(1);
    expect(err.join("")).toContain("Error:");
  });

  test("memory driver path works for init", async () => {
    process.env.SOURCE_STORAGE_DRIVER = "memory";
    process.env.RUNTIME_STORAGE_DRIVER = "memory";
    expect(await run(["init"])).toBe(0);
    expect(out.join("")).toContain("Initialized");
  });
});

/**
 * The CLI has no "create flag" command, so to test `list`/`validate`/`eval`/
 * `publish` we populate the draft directly via a core built over the same file
 * storage the CLI uses (matching the env vars set in beforeEach).
 */
async function buildCore() {
  const { createFlagsCore } = await import("../src/core.ts");
  const { createFileStorage } = await import("../src/storage/file.ts");
  const sourceStorage = createFileStorage({ dir: process.env.SOURCE_FILE_DIR! });
  const runtimeStorage = createFileStorage({ dir: process.env.RUNTIME_FILE_DIR! });
  return createFlagsCore({ sourceStorage, runtimeStorage });
}

async function writeFlag(key: string, enabled: boolean) {
  const core = await buildCore();
  await core.upsertFlag({
    key,
    type: "boolean",
    enabled,
    defaultVariant: enabled ? "on" : "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: enabled ? "on" : "off" },
  });
}

async function writeInvalidFlag(key: string) {
  const core = await buildCore();
  // Replace the draft directly with a structurally-present-but-semantically-invalid
  // flag (default variant not in variants) bypassing upsert's validation.
  const draftKeyMod = await import("../src/keys.ts");
  const { createFileStorage } = await import("../src/storage/file.ts");
  const storage = createFileStorage({ dir: process.env.SOURCE_FILE_DIR! });
  await core.getDraft(); // ensure project/env exist
  await storage.setItem(draftKeyMod.draftKey("default", "production"), {
    projectKey: "default",
    environmentKey: "production",
    flags: {
      [key]: {
        key,
        type: "boolean",
        enabled: true,
        defaultVariant: "missing",
        variants: { on: { value: true }, off: { value: false } },
        fallthrough: { variant: "on" },
      },
    },
  });
}
