import { mkdtemp, readFile, rm } from "node:fs/promises";
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
});

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});
