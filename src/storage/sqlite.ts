/**
 * SQLite storage adapter built on `bun:sqlite` — **Bun only**, zero npm deps.
 * Ideal for single-node deployments and local/dev persistence: durable, fast, and
 * file-backed (or in-memory). For multi-node runtimes prefer Redis/Postgres.
 *
 * The driver is `@xtandard/kit/storage/sqlite`: `bun:sqlite` is loaded on first
 * use, so importing this module works under Node (opening a database needs
 * Bun). The table is created on first use and defaults to `"xtandard_flags"`.
 *
 * ```ts
 * import { createSqliteStorage } from "@xtandard/flags/storage/sqlite";
 * const storage = createSqliteStorage({ path: "./flags.sqlite" });
 * ```
 *
 * @module
 */

import * as kit from "@xtandard/kit/storage/sqlite";

/** Options for {@link createSqliteStorage}. `table` defaults to `"xtandard_flags"`. */
export type SqliteStorageOptions = kit.SqliteStorageOptions;

/** A compare-and-swap capable {@link FlagsStorage} backed by SQLite, plus `close()`. */
export type SqliteFlagsStorage = kit.SqliteKvStorage;

/**
 * Create a SQLite-backed storage. Requires the Bun runtime (`bun:sqlite`).
 *
 * @example
 * ```ts
 * import { createSqliteStorage } from "@xtandard/flags/storage/sqlite";
 *
 * // File-backed (persists across restarts):
 * const storage = createSqliteStorage({ path: "./flags.sqlite" });
 *
 * // In-memory (reset each run, useful for tests):
 * // const storage = createSqliteStorage({ path: ":memory:" });
 * ```
 */
export function createSqliteStorage(options: SqliteStorageOptions = {}): SqliteFlagsStorage {
  return kit.createSqliteStorage({
    subpath: "@xtandard/flags/storage/sqlite",
    ...options,
    table: options.table ?? "xtandard_flags",
  });
}
