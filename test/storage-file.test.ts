import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  clearFileStorage,
  createFileStorage,
  decodeSegment,
  encodeSegment,
} from "../src/storage/file.ts";
import { runStorageContractTests } from "./storage-contract.ts";

/** Each contract test gets its own throwaway temp dir so they stay isolated. */
const tempDirs: string[] = [];
async function freshDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "xtandard-flags-file-"));
  tempDirs.push(dir);
  return dir;
}

// The flags default, `legacy: "read-through"`.
runStorageContractTests("file", async () => createFileStorage({ dir: await freshDir() }), {
  t: { describe, test, expect },
  capabilities: { compareAndSwap: true, watch: { settleMs: 250 } },
});

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

  test("encodes case and special characters in file names, reversibly", async () => {
    expect(encodeSegment("production")).toBe("production");
    expect(encodeSegment("MyProject")).toBe("^my^project");
    expect(encodeSegment("a?b\\c^d")).toBe("a%3Fb%5Cc^^d");
    expect(encodeSegment(".hidden")).toBe("%2Ehidden");
    for (const s of ["MyProject", "café", "a?b\\c^d", "..", "%41"])
      expect(decodeSegment(encodeSegment(s))).toBe(s);
    const storage = createFileStorage({ dir });
    await storage.setItem("flags/Acme/e/k", 1);
    expect(await readdir(join(dir, "flags"))).toEqual(["^acme"]);
  });

  test("reads and lists files written before the encoding; a write migrates them", async () => {
    // A tree from an earlier version: raw (uppercase) segment names.
    await mkdir(join(dir, "flags", "MyProject", "e"), { recursive: true });
    await writeFile(join(dir, "flags", "MyProject", "e", "k.json"), JSON.stringify({ v: 1 }));
    const storage = createFileStorage({ dir });
    expect(await storage.getItem("flags/MyProject/e/k")).toEqual({ v: 1 });
    expect(await storage.getKeys("flags/")).toEqual(["flags/MyProject/e/k"]);
    await storage.setItem("flags/MyProject/e/k", { v: 2 });
    expect(await storage.getKeys("flags/")).toEqual(["flags/MyProject/e/k"]);
    expect(await readdir(join(dir, "flags", "MyProject", "e"))).toEqual([]);
    expect(await storage.getItem("flags/MyProject/e/k")).toEqual({ v: 2 });
  });

  test("clearFileStorage removes everything", async () => {
    const storage = createFileStorage({ dir });
    await storage.setItem("flags/p/e/k", { v: 1 });
    await clearFileStorage({ dir });
    expect(await storage.getKeys("flags/")).toEqual([]);
  });

  test("getKeys ignores non-.json files in the tree", async () => {
    const storage = createFileStorage({ dir });
    await storage.setItem("flags/p/e/k", { v: 1 });
    await writeFile(join(dir, "stray.txt"), "not a key", "utf8");
    const keys = await storage.getKeys("");
    expect(keys).toEqual(["flags/p/e/k"]);
  });
});

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});
