/**
 * `@xtandard/flags/drizzle/pg` — a Drizzle table factory for the flags KV store.
 *
 * Schema-only (imports just `drizzle-orm/pg-core`, never the flags core), so it
 * is safe to use inside a Drizzle schema file. The base table is the store's KV
 * shape (`key text PRIMARY KEY`, `value jsonb NOT NULL`); adding it to your
 * schema brings the flags table into your normal `drizzle-kit` generate/migrate
 * flow instead of an adapter-side `CREATE TABLE`. `extraColumns`/`extraIndexes`
 * extend it.
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

import { pgKvTable, type DrizzleKvTable, type PgKvTableOptions } from "@xtandard/kit/drizzle/pg";

export type { DrizzleKvTable } from "@xtandard/kit/drizzle/pg";

/**
 * Options for {@link pgFlagsTable}: `schema` (Postgres namespace; default the
 * public schema), `extraColumns`, `extraIndexes`, and `keyCollation` (default
 * `null`: a plain `text` key, as every earlier release; `"C"` for bytewise,
 * index-usable prefixes on new tables).
 */
export type PgFlagsTableOptions = PgKvTableOptions;

/**
 * Build the Drizzle `pgTable` for the flags KV store. Base columns are fixed —
 * `key text PRIMARY KEY`, `value jsonb NOT NULL` — and required by
 * `createDrizzleStorage`; `schema`/`extraColumns`/`extraIndexes` extend it. The
 * key keeps the plain `text` type of earlier releases, so existing schemas see
 * no `drizzle-kit` diff; prefix queries are exact either way.
 */
export function pgFlagsTable(name: string, opts?: PgFlagsTableOptions): DrizzleKvTable {
  return pgKvTable(name, { keyCollation: null, ...opts });
}
