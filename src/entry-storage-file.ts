/**
 * File-system storage: `createFileStorage` keeps each key as a JSON file under a
 * directory (`node:fs`, Bun and Node), with change notifications. For local
 * development and drafts kept in version control.
 *
 * Subpath entry for `@xtandard/flags/storage/file`: re-exports the adapter so
 * the bundler can map it to its own dist file.
 *
 * @module storage/file
 */

export * from "./storage/file.ts";
