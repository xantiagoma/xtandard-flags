import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { clearFileStorage, createFileStorage } from "../src/storage/file.ts";
import { runStorageContractTests } from "./storage-contract.ts";

/** Each contract test gets its own throwaway temp dir so they stay isolated. */
const tempDirs: string[] = [];
async function freshDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "xtandard-flags-file-"));
  tempDirs.push(dir);
  return dir;
}

runStorageContractTests("file", async () => createFileStorage({ dir: await freshDir() }));

describe("createFileStorage specifics", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "xtandard-flags-file-spec-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("writes a JSON file mirroring the key tree", async () => {
    const storage = createFileStorage({ dir });
    await storage.setItem("flags/default/production/snapshots/v1", { enabled: true });
    const raw = await readFile(
      join(dir, "flags", "default", "production", "snapshots", "v1.json"),
      "utf8",
    );
    expect(JSON.parse(raw)).toEqual({ enabled: true });
  });

  test("reconstructs original keys from file paths", async () => {
    const storage = createFileStorage({ dir });
    await storage.setItem("flags/p/e/snapshots/v1", { v: 1 });
    await storage.setItem("flags/p/e/snapshots/v2", { v: 2 });
    const keys = await storage.getKeys("flags/p/e/snapshots/");
    expect(keys.sort()).toEqual(["flags/p/e/snapshots/v1", "flags/p/e/snapshots/v2"]);
  });

  test("getKeys on a fresh (nonexistent) dir returns empty", async () => {
    const storage = createFileStorage({ dir: join(dir, "does-not-exist") });
    expect(await storage.getKeys("flags/")).toEqual([]);
  });

  test("clearFileStorage removes everything", async () => {
    const storage = createFileStorage({ dir });
    await storage.setItem("flags/p/e/k", { v: 1 });
    await clearFileStorage({ dir });
    expect(await storage.getKeys("flags/")).toEqual([]);
  });

  test("removeItem of a missing key is a no-op", async () => {
    const storage = createFileStorage({ dir });
    await expect(storage.removeItem("flags/p/e/ghost")).resolves.toBeUndefined();
  });

  test("creates nested directories for deep keys", async () => {
    const storage = createFileStorage({ dir });
    await storage.setItem("flags/a/b/c/d/e/leaf", { deep: true });
    expect(await storage.getItem("flags/a/b/c/d/e/leaf")).toEqual({ deep: true });
  });

  test("getKeys ignores non-.json files in the tree", async () => {
    const storage = createFileStorage({ dir });
    await storage.setItem("flags/p/e/k", { v: 1 });
    await writeFile(join(dir, "stray.txt"), "not a key", "utf8");
    const keys = await storage.getKeys("");
    expect(keys).toEqual(["flags/p/e/k"]);
  });

  test("watch reports change events for matching keys", async () => {
    const storage = createFileStorage({ dir });
    const events: { type: string; key: string }[] = [];
    const off = await storage.watch("flags/", (e) => events.push(e));
    await storage.setItem("flags/w/e/k", { v: 1 });
    await new Promise((r) => setTimeout(r, 250));
    off();
    expect(events.some((e) => e.key === "flags/w/e/k")).toBe(true);
  });
});

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});
