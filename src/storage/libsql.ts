/**
 * libSQL / [Turso](https://turso.tech) storage adapter built on the
 * [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts) package
 * (an optional peer dependency). It speaks the same SQL dialect as SQLite but
 * works against a **remote, replicated, edge-distributed** database — or a local
 * file / embedded replica — so it suits multi-node and edge runtimes where
 * `bun:sqlite` (single-file, Bun-only) does not.
 *
 * Pass either a pre-constructed `client`, or `url` (+ optional `authToken`) to let
 * the adapter construct one lazily on first use. Keys are stored verbatim as the
 * primary key; namespace via a distinct `table` or a separate database.
 *
 * The driver is `@xtandard/kit/storage/libsql`. The table is created on first
 * use (a failed connect or DDL is retried) and defaults to `"xtandard_flags"`.
 *
 * ```ts
 * import { createLibsqlStorage } from "@xtandard/flags/storage/libsql";
 *
 * // Turso (remote):
 * const storage = createLibsqlStorage({
 *   url: process.env.TURSO_DATABASE_URL!,    // libsql://<db>-<org>.turso.io
 *   authToken: process.env.TURSO_AUTH_TOKEN!,
 * });
 *
 * // Local file or embedded replica:
 * // const storage = createLibsqlStorage({ url: "file:flags.db" });
 * ```
 *
 * @module
 */

import * as kit from "@xtandard/kit/storage/libsql";

export type { LibsqlClientLike } from "@xtandard/kit/storage/libsql";

/** Options for {@link createLibsqlStorage}. `table` defaults to `"xtandard_flags"`. */
export type LibsqlStorageOptions = kit.LibsqlStorageOptions;

/** A compare-and-swap capable {@link FlagsStorage} backed by libSQL/Turso, plus `close()`. */
export type LibsqlFlagsStorage = kit.LibsqlKvStorage;

/** Create a libSQL/Turso-backed {@link LibsqlFlagsStorage}. The table is created on first use. */
export function createLibsqlStorage(options: LibsqlStorageOptions): LibsqlFlagsStorage {
  return kit.createLibsqlStorage({ ...options, table: options.table ?? "xtandard_flags" });
}
