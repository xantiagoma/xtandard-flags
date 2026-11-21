/**
 * Drizzle storage: `createDrizzleStorage` over a table in your own Drizzle
 * schema and database (Postgres, MySQL or SQLite). It issues no DDL and owns no
 * connection; build the table with `@xtandard/flags/drizzle/{pg,mysql,sqlite}`.
 * Optional peer dependency: `drizzle-orm`.
 *
 * Entry point for the `@xtandard/flags/storage/drizzle` subpath export.
 *
 * @module storage/drizzle
 */

export * from "./storage/drizzle.ts";
