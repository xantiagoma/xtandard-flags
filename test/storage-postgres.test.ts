import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createPostgresStorage, type PostgresFlagsStorage } from "../src/storage/postgres.ts";
import { runStorageContractTests } from "./storage-contract.ts";

/**
 * Run the shared {@link FlagsStorage} contract suite against the Postgres
 * adapter, backed by an in-process PGlite instance so no server is required and
 * the tests always run. Each invocation gets a FRESH PGlite for isolation.
 */
runStorageContractTests("postgres (pglite)", async () =>
  createPostgresStorage({ client: new PGlite(), table: "kv" }),
);

/** Adapter-specific behaviour against in-process PGlite. */
describe("createPostgresStorage (pglite)", () => {
  let storage: PostgresFlagsStorage;

  beforeAll(() => {
    storage = createPostgresStorage({ client: new PGlite(), table: "flags_test" });
  });

  test("round-trips a nested object value", async () => {
    const value = { enabled: true, rollout: 42, tags: ["a", "b"], nested: { x: 1 } };
    await storage.setItem("flags/p/e/snapshots/v1", value);
    expect(await storage.getItem("flags/p/e/snapshots/v1")).toEqual(value);
  });

  test("returns null for a missing key", async () => {
    expect(await storage.getItem("flags/p/e/does-not-exist")).toBeNull();
  });

  test("isolates by prefix", async () => {
    await storage.setItem("flags/p1/e/a", { v: 1 });
    await storage.setItem("flags/p2/e/b", { v: 2 });
    expect(await storage.getKeys("flags/p1/")).toEqual(["flags/p1/e/a"]);
    expect(await storage.getKeys("flags/p2/")).toEqual(["flags/p2/e/b"]);
  });

  test("handles deeply nested keys", async () => {
    await storage.setItem("flags/p/e/snapshots/v1", { v: 1 });
    expect(await storage.getItem("flags/p/e/snapshots/v1")).toEqual({ v: 1 });
    expect(await storage.getKeys("flags/p/e/snapshots/")).toContain("flags/p/e/snapshots/v1");
  });

  test("two separate PGlite instances do not share data", async () => {
    const a = createPostgresStorage({ client: new PGlite(), table: "shared" });
    const b = createPostgresStorage({ client: new PGlite(), table: "shared" });
    await a.setItem("flags/p/e/only-in-a", { v: 1 });
    expect(await b.getItem("flags/p/e/only-in-a")).toBeNull();
    expect(await a.getItem("flags/p/e/only-in-a")).toEqual({ v: 1 });
  });
});

/** Type/shape checks that need no client connection. */
describe("createPostgresStorage shape", () => {
  test("rejects an unsafe table name", () => {
    expect(() =>
      createPostgresStorage({ client: new PGlite(), table: "bad; DROP TABLE x" }),
    ).toThrow();
  });

  test("close() with a borrowed client is a safe no-op", async () => {
    const s = createPostgresStorage({ client: new PGlite(), table: "kv" });
    await expect(s.close()).resolves.toBeUndefined();
  });
});

/**
 * Optional live-server suite — runs only when `POSTGRES_URL` is set, so CI
 * without a Postgres server simply skips it. Cleans up after itself.
 */
describe.skipIf(!process.env.POSTGRES_URL)("createPostgresStorage (live)", () => {
  const table = `xtandard_flags_test_${Date.now()}`;
  let storage: PostgresFlagsStorage;

  beforeAll(() => {
    storage = createPostgresStorage({ connectionString: process.env.POSTGRES_URL, table });
  });

  afterAll(async () => {
    for (const key of await storage.getKeys("")) await storage.removeItem(key);
    await storage.close();
  });

  test("round-trips an object value", async () => {
    const value = { enabled: true, rollout: 42, nested: { x: 1 } };
    await storage.setItem("flags/p/e/snapshots/v1", value);
    expect(await storage.getItem("flags/p/e/snapshots/v1")).toEqual(value);
  });

  test("getKeys isolates by prefix", async () => {
    await storage.setItem("flags/iso1/e/a", { v: 1 });
    await storage.setItem("flags/iso2/e/b", { v: 2 });
    expect(await storage.getKeys("flags/iso1/")).toEqual(["flags/iso1/e/a"]);
    expect(await storage.getKeys("flags/iso2/")).toEqual(["flags/iso2/e/b"]);
  });
});
