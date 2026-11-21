import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableName } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { getTableConfig as getPgTableConfig, text, type PgTable } from "drizzle-orm/pg-core";
import { pgFlagsTable } from "../src/drizzle/pg.ts";
import { getTableConfig, type MySqlTable } from "drizzle-orm/mysql-core";
import { mysqlFlagsTable } from "../src/drizzle/mysql.ts";
import { sqliteFlagsTable } from "../src/drizzle/sqlite.ts";
import { createDrizzleStorage } from "../src/storage/drizzle.ts";
import { runStorageContractTests } from "./storage-contract.ts";

/**
 * The kit conformance suite against the Drizzle adapter over a Postgres Drizzle
 * database (in-process PGlite). Each run gets a fresh DB; the table is created
 * by the test (mirroring a consumer's migration — the adapter itself issues no
 * DDL). This also proves a real Drizzle db satisfies the adapter's `db` type.
 */
let client = new PGlite();
runStorageContractTests(
  "drizzle (pg/pglite)",
  async () => {
    client = new PGlite();
    await client.exec(`CREATE TABLE flags_kv (key text PRIMARY KEY, value jsonb NOT NULL)`);
    return createDrizzleStorage({ db: drizzle(client), table: pgFlagsTable("flags_kv") });
  },
  {
    t: { describe, test, expect },
    capabilities: { compareAndSwap: true, watch: false },
    timeout: 60_000,
    seedLegacy: async (_storage, key, raw) => {
      await client.query(`INSERT INTO flags_kv (key, value) VALUES ($1, $2::jsonb)`, [key, raw]);
    },
  },
);

describe("table factories — shape", () => {
  test("all three dialects expose key + value columns under the given name", () => {
    for (const t of [pgFlagsTable("kv"), mysqlFlagsTable("kv"), sqliteFlagsTable("kv")]) {
      expect(t.key).toBeDefined();
      expect(t.value).toBeDefined();
      expect(getTableName(t)).toBe("kv");
    }
  });

  test("the MySQL key column is case- and accent-sensitive (utf8mb4_bin)", () => {
    const key = getTableConfig(mysqlFlagsTable("kv") as unknown as MySqlTable).columns.find(
      (c) => c.name === "key",
    )!;
    expect(key.getSQLType()).toBe("varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
    expect(key.primary).toBe(true);
    const custom = getTableConfig(
      mysqlFlagsTable("kv", { keyLength: 191 }) as unknown as MySqlTable,
    ).columns[0]!;
    expect(custom.getSQLType()).toMatch(/^varchar\(191\) .*utf8mb4_bin$/);
  });

  test("the pg key column stays plain text (no drizzle-kit diff for existing schemas)", () => {
    const key = getPgTableConfig(pgFlagsTable("kv") as unknown as PgTable).columns.find(
      (c) => c.name === "key",
    )!;
    expect(key.getSQLType()).toBe("text");
  });

  test("extraColumns merges additional columns onto the table", () => {
    const t = pgFlagsTable("kv", { extraColumns: () => ({ tenantId: text("tenant_id") }) });
    expect((t as unknown as Record<string, unknown>).tenantId).toBeDefined();
    // Accepting extraIndexes must not throw (Drizzle invokes it lazily at SQL-gen).
    expect(() => pgFlagsTable("kv", { extraIndexes: () => [] })).not.toThrow();
    expect(() => pgFlagsTable("kv", { schema: "app" })).not.toThrow();
  });
});
