/**
 * `@xtandard/flags/drizzle/mysql` — MySQL Drizzle table factory for the flags KV
 * store. Schema-only (imports just `drizzle-orm/mysql-core`).
 *
 * Base columns: `key varchar PRIMARY KEY` (length configurable, `utf8mb4_bin`),
 * `value json NOT NULL`. `extraColumns`/`extraIndexes` extend it.
 *
 * The key uses the **`utf8mb4_bin`** collation: MySQL's default
 * (`utf8mb4_0900_ai_ci`) is case- and accent-insensitive, which would make keys
 * like `flags/Acme/…` and `flags/acme/…` the same row. Tables created before
 * this need `ALTER TABLE <name> MODIFY \`key\` varchar(512) CHARACTER SET utf8mb4
 * COLLATE utf8mb4_bin NOT NULL` (see docs/STORAGE.md). `utf8mb4_bin` is PAD
 * SPACE (trailing spaces are ignored); new tables can opt into
 * `keyCollation: "utf8mb4_0900_bin"` (MySQL 8.0+) or `"utf8mb4_nopad_bin"`
 * (MariaDB).
 *
 * @example
 * ```ts
 * import { mysqlFlagsTable } from "@xtandard/flags/drizzle/mysql";
 * export const flagsKv = mysqlFlagsTable("flags_kv");
 * ```
 *
 * @module
 */

import {
  mysqlKvTable,
  type DrizzleKvTable,
  type MysqlKvTableOptions,
} from "@xtandard/kit/drizzle/mysql";

export type { DrizzleKvTable } from "@xtandard/kit/drizzle/mysql";

/**
 * Options for {@link mysqlFlagsTable}: `keyLength` (default `512`; keep within
 * your InnoDB index-prefix limit), `keyCollation` (default `utf8mb4_bin`; opt
 * into `utf8mb4_0900_bin` / `utf8mb4_nopad_bin` for new tables),
 * `extraColumns` and `extraIndexes`.
 */
export type MysqlFlagsTableOptions = MysqlKvTableOptions;

/**
 * Build the MySQL `mysqlTable` for the flags KV store: `key varchar PRIMARY KEY`
 * (`utf8mb4_bin`), `value json NOT NULL`.
 */
export function mysqlFlagsTable(name: string, opts?: MysqlFlagsTableOptions): DrizzleKvTable {
  return mysqlKvTable(name, opts);
}
