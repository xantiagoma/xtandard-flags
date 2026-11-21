/**
 * libSQL / Turso storage: `createLibsqlStorage`, SQLite's dialect on a remote,
 * replicated or embedded database, for multi-node and edge runtimes. Optional
 * peer dependency: `@libsql/client`.
 *
 * Subpath entry for `@xtandard/flags/storage/libsql`: re-exports the adapter so
 * the bundler can map it to its own dist file.
 *
 * @module storage/libsql
 */

export * from "./storage/libsql.ts";
