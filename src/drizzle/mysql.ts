/**
 * `@xtandard/flags/drizzle/mysql` — MySQL Drizzle table factory for the flags KV
 * store. Schema-only (imports just `drizzle-orm/mysql-core`).
 *
 * Base columns: `key varchar PRIMARY KEY` (length configurable, `utf8mb4_bin`),
 * `value json NOT NULL`. `extraColumns`/`extraIndexes` mirror `drizzle-audit`.
 *
 * The key uses the **`utf8mb4_bin`** collation: MySQL's default
 * (`utf8mb4_0900_ai_ci`) is case- and accent-insensitive, which would make keys
 * like `flags/Acme/…` and `flags/acme/…` the same row. Tables created before
 * this need `ALTER TABLE <name> MODIFY \`key\` varchar(512) CHARACTER SET utf8mb4
 * COLLATE utf8mb4_bin NOT NULL` (see docs/STORAGE.md).
 *
 * @example
 * ```ts
 * import { mysqlFlagsTable } from "@xtandard/flags/drizzle/mysql";
 * export const flagsKv = mysqlFlagsTable("flags_kv");
 * ```
 *
 * @module
 */

import type { BuildColumns } from "drizzle-orm";
import {
  customType,
  json,
  mysqlTable,
  type MySqlColumnBuilderBase,
  type MySqlTableExtraConfigValue,
} from "drizzle-orm/mysql-core";
import type { DrizzleKvTable } from "./table.ts";

export type { DrizzleKvTable } from "./table.ts";

/** The `self` passed to an {@link MysqlFlagsTableOptions.extraIndexes} callback. */
type MysqlFlagsColumns = BuildColumns<string, Record<string, MySqlColumnBuilderBase>, "mysql">;

/** A case- and accent-sensitive (`utf8mb4_bin`) `varchar(length)`. */
const binVarchar = (name: string, length: number) =>
  customType<{ data: string }>({
    dataType: () => `varchar(${length}) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
  })(name);

/** Options for {@link mysqlFlagsTable}. */
export interface MysqlFlagsTableOptions {
  /**
   * `varchar` length for the `key` primary key. Default `512` (store keys are
   * short slash-delimited paths). Keep within your InnoDB index-prefix limit.
   */
  keyLength?: number;
  /** Additional columns merged into the table. */
  extraColumns?: () => Record<string, MySqlColumnBuilderBase>;
  /** Additional indexes/constraints; receives the built table for column references. */
  extraIndexes?: (table: MysqlFlagsColumns) => MySqlTableExtraConfigValue[];
}

/**
 * Build the MySQL `mysqlTable` for the flags KV store: `key varchar PRIMARY KEY`
 * (`utf8mb4_bin`), `value json NOT NULL`.
 */
export function mysqlFlagsTable(name: string, opts?: MysqlFlagsTableOptions): DrizzleKvTable {
  const columns = {
    key: binVarchar("key", opts?.keyLength ?? 512).primaryKey(),
    value: json("value").notNull(),
    ...opts?.extraColumns?.(),
  };
  // Cast to the exact `self` type Drizzle infers from `columns` — the public
  // `extraIndexes` type uses a generic column map, which is a supertype.
  const extraConfig = opts?.extraIndexes as
    | ((self: BuildColumns<string, typeof columns, "mysql">) => MySqlTableExtraConfigValue[])
    | undefined;
  return mysqlTable(name, columns, extraConfig);
}
