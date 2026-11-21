/**
 * Drizzle storage adapter — a {@link FlagsStorage} over a **consumer-owned**
 * Drizzle table and database. Unlike `createPostgresStorage` it issues **no
 * DDL** (the table lives in your Drizzle schema + migrations) and **owns no
 * connection** (it reuses the `db` you pass, and never closes it).
 *
 * Dialect-agnostic: works with Postgres, MySQL, and SQLite Drizzle databases.
 * Build the backing table with the matching factory — `pgFlagsTable` /
 * `mysqlFlagsTable` / `sqliteFlagsTable` — whose fixed `key`/`value` columns
 * this adapter reads and writes.
 *
 * The driver is `@xtandard/kit/storage/drizzle`: `compareAndSwap` on all three
 * dialects, and on MySQL keys that differ only by trailing spaces never cross
 * (a write that would collide throws {@link KeyCollisionError}).
 *
 * @example
 * ```ts
 * import { drizzle } from "drizzle-orm/node-postgres";
 * import { createDrizzleStorage } from "@xtandard/flags/storage/drizzle";
 * import { pgFlagsTable } from "@xtandard/flags/drizzle/pg";
 *
 * export const flagsKv = pgFlagsTable("flags_kv"); // add to your schema + migrate
 * const db = drizzle(pool);                        // your existing pool
 * const storage = createDrizzleStorage({ db, table: flagsKv });
 * ```
 *
 * @module
 */

export {
  createDrizzleStorage,
  KeyCollisionError,
  type DrizzleKvStorage as DrizzleFlagsStorage,
  type DrizzleKvTable,
  type DrizzleStorageOptions,
} from "@xtandard/kit/storage/drizzle";
