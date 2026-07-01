import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, test, vi } from "vitest";
import { text } from "drizzle-orm/pg-core";
import { pgFlagsTable } from "../src/drizzle/pg.ts";
import { mysqlFlagsTable } from "../src/drizzle/mysql.ts";
import { sqliteFlagsTable } from "../src/drizzle/sqlite.ts";
import { createDrizzleStorage, type DrizzleNotificationClient } from "../src/storage/drizzle.ts";
import { isWatchable } from "../src/storage/contract.ts";
import { runStorageContractTests } from "./storage-contract.ts";

/**
 * Run the shared FlagsStorage contract suite against the Drizzle adapter over a
 * Postgres Drizzle database (in-process PGlite). Each run gets a fresh DB; the
 * table is created by the test (mirroring a consumer's migration — the adapter
 * itself issues no DDL). This also proves a real Drizzle db satisfies the
 * adapter's structural `db` type.
 */
runStorageContractTests("drizzle (pg/pglite)", async () => {
  const client = new PGlite();
  await client.exec(`CREATE TABLE flags_kv (key text PRIMARY KEY, value jsonb NOT NULL)`);
  const db = drizzle(client);
  return createDrizzleStorage({ db, table: pgFlagsTable("flags_kv") });
});

describe("createDrizzleStorage (pg/pglite)", () => {
  test("round-trips nested values and isolates by prefix", async () => {
    const client = new PGlite();
    await client.exec(`CREATE TABLE kv (key text PRIMARY KEY, value jsonb NOT NULL)`);
    const storage = createDrizzleStorage({ db: drizzle(client), table: pgFlagsTable("kv") });

    const value = { enabled: true, rollout: 42, nested: { tags: ["a", "b"] } };
    await storage.setItem("flags/p/e/snapshots/v1", value);
    expect(await storage.getItem("flags/p/e/snapshots/v1")).toEqual(value);

    await storage.setItem("flags/p1/e/a", { v: 1 });
    await storage.setItem("flags/p2/e/b", { v: 2 });
    expect(await storage.getKeys("flags/p1/")).toEqual(["flags/p1/e/a"]);
  });

  test("setItem upserts (second write wins)", async () => {
    const client = new PGlite();
    await client.exec(`CREATE TABLE kv (key text PRIMARY KEY, value jsonb NOT NULL)`);
    const storage = createDrizzleStorage({ db: drizzle(client), table: pgFlagsTable("kv") });
    await storage.setItem("k", { n: 1 });
    await storage.setItem("k", { n: 2 });
    expect(await storage.getItem("k")).toEqual({ n: 2 });
  });

  test("no watch option → not watchable", async () => {
    const client = new PGlite();
    await client.exec(`CREATE TABLE kv (key text PRIMARY KEY, value jsonb NOT NULL)`);
    const storage = createDrizzleStorage({ db: drizzle(client), table: pgFlagsTable("kv") });
    expect(isWatchable(storage)).toBe(false);
  });
});

describe("createDrizzleStorage — opt-in watch (LISTEN/NOTIFY wiring)", () => {
  // A fake notification client: records LISTEN/UNLISTEN and lets us emit events.
  function fakeClient() {
    const queries: string[] = [];
    let handler: ((msg: { channel: string; payload?: string }) => void) | undefined;
    const client: DrizzleNotificationClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
      }),
      on: (_e, listener) => {
        handler = listener;
      },
      removeListener: () => {
        handler = undefined;
      },
    };
    return {
      client,
      queries,
      emit: (payload?: string) => handler?.({ channel: "flags_ch", payload }),
    };
  }

  const table = pgFlagsTable("kv");
  const withWatch = (client: DrizzleNotificationClient) =>
    createDrizzleStorage({
      db: {}, // watch path does not touch db
      table,
      watch: { client, channel: "flags_ch" },
    });

  test("watch option makes it watchable and LISTENs on the channel", async () => {
    const { client, queries } = fakeClient();
    const storage = withWatch(client);
    expect(isWatchable(storage)).toBe(true);
    const off = await storage.watch!("flags/", () => {});
    expect(queries.some((q) => q.includes(`LISTEN "flags_ch"`))).toBe(true);
    await off();
    expect(queries.some((q) => q.includes(`UNLISTEN "flags_ch"`))).toBe(true);
  });

  test("delivers notifications whose payload matches the prefix, filters others", async () => {
    const { client, emit } = fakeClient();
    const storage = withWatch(client);
    const seen: string[] = [];
    await storage.watch!("flags/p1/", (e) => seen.push(e.key));
    emit("flags/p1/e/a"); // match
    emit("flags/p2/e/b"); // filtered out
    expect(seen).toEqual(["flags/p1/e/a"]);
  });
});

describe("table factories — shape", () => {
  afterEach(() => vi.restoreAllMocks());

  test("all three dialects expose key + value columns", () => {
    for (const t of [pgFlagsTable("kv"), mysqlFlagsTable("kv"), sqliteFlagsTable("kv")]) {
      expect(t.key).toBeDefined();
      expect(t.value).toBeDefined();
    }
  });

  test("extraColumns merges additional columns onto the table", () => {
    const t = pgFlagsTable("kv", { extraColumns: () => ({ tenantId: text("tenant_id") }) });
    expect((t as unknown as Record<string, unknown>).tenantId).toBeDefined();
    // Accepting extraIndexes must not throw (Drizzle invokes it lazily at SQL-gen).
    expect(() => pgFlagsTable("kv", { extraIndexes: () => [] })).not.toThrow();
  });
});
