import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, test } from "vitest";
import { createPostgresStorage } from "../src/storage/postgres.ts";
import { runStorageContractTests } from "./storage-contract.ts";

/**
 * The kit conformance suite against the wrapped Postgres driver, backed by an
 * in-process PGlite instance so no server is required. Each invocation gets a
 * FRESH PGlite for isolation.
 */
let pglite = new PGlite();
runStorageContractTests(
  "postgres (pglite)",
  () => createPostgresStorage({ client: (pglite = new PGlite()) }),
  {
    t: { describe, test, expect },
    capabilities: { compareAndSwap: true, watch: false },
    timeout: 60_000,
    seedLegacy: async (storage, key, raw) => {
      await storage.getKeys(""); // run the DDL
      await pglite.query(`INSERT INTO xtandard_flags (key, value) VALUES ($1, $2::jsonb)`, [
        key,
        raw,
      ]);
    },
  },
);

describe("createPostgresStorage (flags defaults)", () => {
  test('the table defaults to "xtandard_flags" (stored-data compatibility)', async () => {
    const client = new PGlite();
    // A row written by an earlier release, in its own table, reads back.
    await client.exec(
      `CREATE TABLE xtandard_flags (key text PRIMARY KEY, value jsonb NOT NULL);
       INSERT INTO xtandard_flags VALUES ('flags/acme/metadata', '{"key":"acme","name":"Acme"}');`,
    );
    const storage = createPostgresStorage({ client });
    expect(await storage.getItem("flags/acme/metadata")).toEqual({ key: "acme", name: "Acme" });
    expect(await storage.getKeys("flags/")).toEqual(["flags/acme/metadata"]);
  });

  test("an explicit table is honoured", async () => {
    const client = new PGlite();
    await createPostgresStorage({ client, table: "custom_kv" }).setItem("flags/k", { v: 1 });
    const { rows } = await client.query<{ key: string }>(`SELECT key FROM custom_kv`);
    expect(rows).toEqual([{ key: "flags/k" }]);
  });
});

/**
 * Optional live-server suite — runs only when `POSTGRES_URL` is set, so CI
 * without a Postgres server simply skips it. Cleans up after itself.
 */
describe.skipIf(!process.env.POSTGRES_URL)("createPostgresStorage (live)", () => {
  const tables: string[] = [];
  let n = 0;
  runStorageContractTests(
    "postgres (live)",
    () => {
      const table = `xtandard_flags_test_${Date.now()}_${n++}`;
      tables.push(table);
      return createPostgresStorage({ connectionString: process.env.POSTGRES_URL, table });
    },
    {
      t: { describe, test, expect },
      capabilities: { compareAndSwap: true, watch: false },
      timeout: 30_000,
    },
  );
  // The kit suite closes each storage after its case, so drop the tables over a connection of our own.
  afterAll(async () => {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
    await client.connect();
    try {
      for (const table of tables) await client.query(`DROP TABLE IF EXISTS "${table}"`);
    } finally {
      await client.end();
    }
  });
});
