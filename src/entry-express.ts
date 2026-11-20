/**
 * Express adapter: `flagsPanel` returns a request handler serving the admin
 * panel, to mount with `app.use()` before any body-parsing middleware. Optional
 * peer dependency: `express` 4 or 5 (types only at runtime).
 *
 * Entry point for the `@xtandard/flags/express` subpath export.
 *
 * @module express
 */

export * from "./adapters/express.ts";
