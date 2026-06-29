/**
 * In-memory storage adapter. Zero deps. Useful for tests, dev, and as the
 * default `runtimeStorage` fallback. Values are deep-cloned on write and read so
 * callers cannot mutate stored state by reference.
 *
 * @module
 */

import type { FlagsStorage, StorageChangeEvent, WatchableFlagsStorage } from "./contract.ts";

/** Options for {@link createMemoryStorage}. */
export interface MemoryStorageOptions {
  /** Optional seed data (key → value). */
  initial?: Record<string, unknown>;
}

const clone = <T>(value: T): T => (value === undefined ? value : (structuredClone(value) as T));

/**
 * Create an in-memory {@link FlagsStorage}. Also implements `watch` synchronously
 * (callbacks fire on the next microtask after a write/remove).
 */
export function createMemoryStorage(options: MemoryStorageOptions = {}): WatchableFlagsStorage {
  const map = new Map<string, unknown>();
  if (options.initial) {
    for (const [k, val] of Object.entries(options.initial)) map.set(k, clone(val));
  }

  const watchers = new Set<{ prefix: string; cb: (event: StorageChangeEvent) => void }>();
  const notify = (event: StorageChangeEvent) => {
    for (const w of watchers) {
      if (event.key.startsWith(w.prefix)) queueMicrotask(() => w.cb(event));
    }
  };

  return {
    async getItem<T>(key: string): Promise<T | null> {
      return map.has(key) ? clone(map.get(key) as T) : null;
    },
    async setItem<T>(key: string, value: T): Promise<void> {
      map.set(key, clone(value));
      notify({ type: "update", key });
    },
    async removeItem(key: string): Promise<void> {
      if (map.delete(key)) notify({ type: "remove", key });
    },
    async getKeys(prefix: string): Promise<string[]> {
      const out: string[] = [];
      for (const k of map.keys()) if (k.startsWith(prefix)) out.push(k);
      return out;
    },
    async watch(prefix, cb): Promise<() => void> {
      const entry = { prefix, cb };
      watchers.add(entry);
      return () => {
        watchers.delete(entry);
      };
    },
  } satisfies FlagsStorage & WatchableFlagsStorage;
}
