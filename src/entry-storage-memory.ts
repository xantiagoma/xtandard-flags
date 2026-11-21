/**
 * In-memory storage: `createMemoryStorage`, with change notifications and no
 * dependencies. For tests, development and single-process setups; also the
 * default runtime storage when none is given.
 *
 * Subpath entry for `@xtandard/flags/storage/memory`: re-exports the adapter so
 * the bundler can map it to its own dist file.
 *
 * @module storage/memory
 */

export * from "./storage/memory.ts";
