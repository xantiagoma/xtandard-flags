/**
 * `@xtandard/flags/drizzle/pg` — a Drizzle table factory for the flags KV store.
 *
 * Schema-only (imports just `drizzle-orm/pg-core`, never the flags core), so it
 * is safe to use inside a Drizzle schema file. The base table is the store's KV
 * shape (`key text PRIMARY KEY`, `value jsonb NOT NULL`); adding it to your
 * schema brings the flags table into your normal `drizzle-kit` generate/migrate
 * flow instead of an adapter-side `CREATE TABLE`. `extraColumns`/`extraIndexes`
 * mirror the `drizzle-audit` factories for when you want to extend it.
 *
 * @example
 * ```ts
 * // schema.ts
 * import { pgFlagsTable } from "@xtandard/flags/drizzle/pg";
 * export const flagsKv = pgFlagsTable("flags_kv");
 *
 * // then: createDrizzleStorage({ db, table: flagsKv })
 * ```
 *
 * @module
 */

import type { BuildExtraConfigColumns } from "drizzle-orm";
import {
  jsonb,
  pgSchema,
  pgTable,
  text,
  type PgColumnBuilderBase,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";
import type { DrizzleKvTable } from "./table.ts";

export type { DrizzleKvTable } from "./table.ts";

/** The `self` passed to an {@link PgFlagsTableOptions.extraIndexes} callback. */
type PgFlagsColumns = BuildExtraConfigColumns<string, Record<string, PgColumnBuilderBase>, "pg">;

/** Options for {@link pgFlagsTable}. */
export interface PgFlagsTableOptions {
  /** Postgres schema (namespace) to place the table in. Defaults to the public schema. */
  schema?: string;
  /** Additional columns merged into the table (e.g. a tenant discriminator). */
  extraColumns?: () => Record<string, PgColumnBuilderBase>;
  /** Additional indexes/constraints; receives the built table for column references. */
  extraIndexes?: (table: PgFlagsColumns) => PgTableExtraConfigValue[];
}

/**
 * Build the Drizzle `pgTable` for the flags KV store. Base columns are fixed —
 * `key text PRIMARY KEY`, `value jsonb NOT NULL` — and required by
 * `createDrizzleStorage`; `schema`/`extraColumns`/`extraIndexes` extend it.
 */
export function pgFlagsTable(name: string, opts?: PgFlagsTableOptions): DrizzleKvTable {
  const columns = {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    ...opts?.extraColumns?.(),
  };
  return opts?.schema
    ? pgSchema(opts.schema).table(name, columns, opts.extraIndexes)
    : pgTable(name, columns, opts?.extraIndexes);
}
