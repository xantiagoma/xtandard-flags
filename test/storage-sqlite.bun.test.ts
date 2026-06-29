/**
 * Bun-native test for the SQLite adapter (`bun:sqlite` is unavailable under Node,
 * so this runs via `bun test`, not vitest — it is excluded from the vitest glob).
 *
 *   bun test test/storage-sqlite.bun-test.ts
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSqliteStorage, type SqliteFlagsStorage } from "../src/storage/sqlite.ts";

let storage: SqliteFlagsStorage;

beforeEach(() => {
  storage = createSqliteStorage({ table: "kv" }); // in-memory
});
afterEach(() => {
  storage.close();
});

describe("sqlite storage", () => {
  test("round-trips objects and returns null for missing keys", async () => {
    expect(await storage.getItem("nope")).toBeNull();
    await storage.setItem("flags/p/e/snapshots/v1", { schemaVersion: 1, flags: { a: 1 } });
    expect(await storage.getItem("flags/p/e/snapshots/v1")).toEqual({
      schemaVersion: 1,
      flags: { a: 1 },
    });
  });

  test("setItem overwrites", async () => {
    await storage.setItem("k", "one");
    await storage.setItem("k", "two");
    expect(await storage.getItem("k")).toBe("two");
  });

  test("removeItem deletes", async () => {
    await storage.setItem("k", 1);
    await storage.removeItem("k");
    expect(await storage.getItem("k")).toBeNull();
  });

  test("getKeys filters by prefix", async () => {
    await storage.setItem("flags/a/x", 1);
    await storage.setItem("flags/a/y", 2);
    await storage.setItem("flags/b/z", 3);
    const keys = (await storage.getKeys("flags/a/")).sort();
    expect(keys).toEqual(["flags/a/x", "flags/a/y"]);
  });

  test("rejects unsafe table names", () => {
    expect(() => createSqliteStorage({ table: "bad; drop table" })).toThrow();
  });

  test("persists across instances sharing a file", async () => {
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const path = join(tmpdir(), `flags-sqlite-${Date.now()}.db`);
    const a = createSqliteStorage({ path, table: "kv" });
    await a.setItem("k", { v: 42 });
    a.close();
    const b = createSqliteStorage({ path, table: "kv" });
    expect(await b.getItem("k")).toEqual({ v: 42 });
    b.close();
  });
});
