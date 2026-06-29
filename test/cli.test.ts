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
  });
});
