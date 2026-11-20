/**
 * Postgres storage: `createPostgresStorage`, one `key`/`jsonb` table created on
 * demand, over `pg` or any client with a `query()` method (PGlite included).
 * Optional peer dependency: `pg`, unless you pass your own client.
 *
 * Subpath entry for `@xtandard/flags/storage/postgres`: re-exports the adapter so
 * the bundler can map it to its own dist file.
 *
 * @module storage/postgres
 */

export * from "./storage/postgres.ts";
