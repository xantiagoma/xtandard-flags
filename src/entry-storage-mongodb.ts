/**
 * MongoDB storage: `createMongoStorage`, one collection of `{ _id, value }`
 * documents. Optional peer dependency: `mongodb`.
 *
 * Subpath entry for `@xtandard/flags/storage/mongodb`: re-exports the adapter so
 * the bundler can map it to its own dist file.
 *
 * @module storage/mongodb
 */

export * from "./storage/mongodb.ts";
