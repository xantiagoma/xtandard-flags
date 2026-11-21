/**
 * In-memory storage adapter. Zero deps. Useful for tests, dev, and as the
 * default `runtimeStorage` fallback. Values are deep-cloned on write and read so
 * callers cannot mutate stored state by reference.
 *
 * The driver is `@xtandard/kit/storage/memory`: it implements `watch` and
 * `compareAndSwap`.
 *
 * @module
 */

import * as kit from "@xtandard/kit/storage/memory";

/** Options for {@link createMemoryStorage}: optional `initial` seed data and an `onWrite` hook. */
export type MemoryStorageOptions = kit.MemoryStorageOptions;

/** A watchable, compare-and-swap capable in-memory storage. */
export type MemoryFlagsStorage = kit.MemoryKvStorage;

/**
 * Create an in-memory {@link FlagsStorage}. Also implements `watch` (callbacks
 * fire on the next microtask after a write/remove) and `compareAndSwap`.
 *
 * @example
 * ```ts
 * import { createMemoryStorage } from "@xtandard/flags/storage/memory";
 *
 * const storage = createMemoryStorage();
 * // Optionally seed with pre-existing data:
 * // const storage = createMemoryStorage({ initial: { "my-key": { value: 1 } } });
 * ```
 */
export function createMemoryStorage(options: MemoryStorageOptions = {}): MemoryFlagsStorage {
  return kit.createMemoryStorage(options);
}
