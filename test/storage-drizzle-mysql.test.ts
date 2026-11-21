import { drizzle } from "drizzle-orm/mysql2";
import { getTableConfig, type MySqlTable } from "drizzle-orm/mysql-core";
import mysql from "mysql2/promise";
import { afterAll, describe, expect, test } from "vitest";
import { mysqlFlagsTable } from "../src/drizzle/mysql.ts";
import { createDrizzleStorage } from "../src/storage/drizzle.ts";
import { runStorageContractTests } from "./storage-contract.ts";

/**
 * Live MySQL suite for the Drizzle adapter (`drizzle-orm/mysql2`): the full
 * contract against a MySQL 8 server at `MYSQL_URL`, skipped when none is
 * reachable (CI provides a `mysql:8` service). The table is created from
 * {@link mysqlFlagsTable}'s own config, so this also checks the factory's
 * column types (the `utf8mb4_bin` key). Each run uses its own database,
 * dropped in `afterAll`.
 */
const MYSQL_URL = process.env.MYSQL_URL ?? "mysql://root:root@127.0.0.1:3306/flags";

// Probe up front (short timeout) so machines without a server skip instead of hanging.
let available = false;
try {
  const probe = await mysql.createConnection({ uri: MYSQL_URL, connectTimeout: 5000 });
  await probe.query("SELECT 1");
  await probe.end();
  available = true;
} catch {
  available = false;
}

const dbName = `flags_test_${Date.now()}`;
let pool: mysql.Pool | undefined;

async function getPool(): Promise<mysql.Pool> {
  if (pool) return pool;
  const admin = await mysql.createConnection({ uri: MYSQL_URL });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await admin.end();
  pool = mysql.createPool({ uri: MYSQL_URL, database: dbName, connectionLimit: 4 });
  return pool;
}

/** `CREATE TABLE` from the Drizzle table's config (what drizzle-kit would generate). */
function createTableSql(table: MySqlTable): string {
  const c = getTableConfig(table);
  const columns = c.columns.map(
    (col) =>
      `\`${col.name}\` ${col.getSQLType()}${col.notNull ? " NOT NULL" : ""}${col.primary ? " PRIMARY KEY" : ""}`,
  );
  return `CREATE TABLE \`${c.name}\` (${columns.join(", ")})`;
}

let n = 0;
async function freshStorage(name = `kv_${n++}`) {
  const p = await getPool();
  const table = mysqlFlagsTable(name);
  await p.query(createTableSql(table as unknown as MySqlTable));
  // `mysql2/promise` and `mysql2` ship separate Pool typings; the runtime object is the same.
  return createDrizzleStorage({ db: drizzle(p as never), table });
}

afterAll(async () => {
  if (!pool) return;
  await pool.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await pool.end();
}, 30_000);

describe.skipIf(!available)("drizzle (mysql2) — live", () => {
  runStorageContractTests("drizzle (mysql2)", () => freshStorage());

  test("the key column is utf8mb4_bin", async () => {
    await freshStorage("kv_collation");
    const [rows] = await (
      await getPool()
    ).query(
      "SELECT COLLATION_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'kv_collation' AND COLUMN_NAME = 'key'",
      [dbName],
    );
    expect((rows as Array<{ c: string }>)[0]?.c).toBe("utf8mb4_bin");
  });
});
