/**
 * Bun-native test for the SQLite adapter (`bun:sqlite` is unavailable under Node,
 * so this runs via `bun test`, not vitest — it is excluded from the vitest glob).
 *
 *   bun test test/storage-sqlite.bun.test.ts
 */
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteStorage, type SqliteFlagsStorage } from "../src/storage/sqlite.ts";
import { runStorageContractTests } from "./storage-contract.ts";

const open: SqliteFlagsStorage[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

let database = new Database(":memory:");
runStorageContractTests(
  "sqlite (bun:sqlite)",
  () => {
    database = new Database(":memory:");
    return createSqliteStorage({ database });
  },
  {
    t: { describe, test, expect },
    capabilities: { compareAndSwap: true, watch: false },
    seedLegacy: async (storage, key, raw) => {
      await storage.getKeys(""); // run the DDL
      database.query("INSERT INTO xtandard_flags (key, value) VALUES (?, ?)").run(key, raw);
    },
  },
);

describe("sqlite storage (flags defaults)", () => {
  test('the table defaults to "xtandard_flags" (rows from earlier releases read back)', async () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE xtandard_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.query("INSERT INTO xtandard_flags VALUES (?, ?)").run(
      "flags/acme/metadata",
      JSON.stringify({ name: "Acme", key: "acme" }),
    );
    const storage = createSqliteStorage({ database: db });
    expect(await storage.getItem("flags/acme/metadata")).toEqual({ key: "acme", name: "Acme" });
    db.close();
  });

  test("persists across instances sharing a file", async () => {
    const path = join(tmpdir(), `flags-sqlite-${Date.now()}.db`);
    const a = createSqliteStorage({ path });
    await a.setItem("flags/acme/k", { v: 1 });
    a.close();
    const b = createSqliteStorage({ path });
    open.push(b);
    expect(await b.getItem("flags/acme/k")).toEqual({ v: 1 });
  });
});
