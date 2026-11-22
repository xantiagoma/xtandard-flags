/**
 * `@xtandard/flags/drizzle/sqlite` — SQLite Drizzle table factory for the flags
 * KV store. Schema-only (imports just `drizzle-orm/sqlite-core`).
 *
 * Base columns: `key text PRIMARY KEY`, `value text NOT NULL` in JSON mode
 * (Drizzle serializes/parses transparently). `extraColumns`/`extraIndexes`
 * extend it.
 *
 * @example
 * ```ts
 * import { sqliteFlagsTable } from "@xtandard/flags/drizzle/sqlite";
 * export const flagsKv = sqliteFlagsTable("flags_kv");
 * ```
 *
 * @module
 */

import {
  sqliteKvTable,
  type DrizzleKvTable,
  type SqliteKvTableOptions,
} from "@xtandard/kit/drizzle/sqlite";

export type { DrizzleKvTable } from "@xtandard/kit/drizzle/sqlite";

/** Options for {@link sqliteFlagsTable}: `extraColumns` and `extraIndexes`. */
export type SqliteFlagsTableOptions = SqliteKvTableOptions;

/**
 * Build the Drizzle `sqliteTable` for the flags KV store: `key text PRIMARY
 * KEY`, `value text NOT NULL` (JSON mode).
 */
export function sqliteFlagsTable(name: string, opts?: SqliteFlagsTableOptions): DrizzleKvTable {
  return sqliteKvTable(name, opts);
}
