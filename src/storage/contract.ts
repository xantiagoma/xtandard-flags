/**
 * Storage contracts. The base {@link FlagsStorage} is intentionally tiny — four
 * async methods — so users can bring their own backend. Optional capabilities
 * (watch, transactions, compare-and-swap) are separate interfaces that adapters
 * may implement and the core feature-detects.
 *
 * @module
 */

/** The minimal key/value contract every storage backend must satisfy. */
export interface FlagsStorage {
  /** Read a value, or `null` if absent. */
  getItem<T>(key: string): Promise<T | null>;
  /** Write a value (overwriting any existing). */
  setItem<T>(key: string, value: T): Promise<void>;
  /** Delete a key (no-op if absent). */
  removeItem(key: string): Promise<void>;
  /** List all keys beginning with `prefix`. */
  getKeys(prefix: string): Promise<string[]>;
}

/** A storage change event delivered to {@link WatchableFlagsStorage.watch} callbacks. */
export interface StorageChangeEvent {
  type: "update" | "remove";
  key: string;
}

/** Storage that can push change notifications (e.g. Redis pub/sub, fs.watch). */
export interface WatchableFlagsStorage extends FlagsStorage {
  /**
   * Subscribe to changes under `prefix`. Resolves to an unsubscribe function.
   */
  watch(prefix: string, callback: (event: StorageChangeEvent) => void): Promise<() => void>;
}

/** Storage that supports atomic multi-key transactions. */
export interface TransactionalFlagsStorage extends FlagsStorage {
  transaction<T>(callback: (tx: FlagsStorage) => Promise<T>): Promise<T>;
}

/** Storage that supports optimistic concurrency via compare-and-swap. */
export interface CompareAndSwapFlagsStorage extends FlagsStorage {
  compareAndSwap<T>(input: { key: string; expected: T | null; next: T }): Promise<boolean>;
}

/** Runtime feature-detection: does this storage implement `watch`? */
export function isWatchable(storage: FlagsStorage): storage is WatchableFlagsStorage {
  return typeof (storage as Partial<WatchableFlagsStorage>).watch === "function";
}

/** Runtime feature-detection: does this storage implement `transaction`? */
export function isTransactional(storage: FlagsStorage): storage is TransactionalFlagsStorage {
  return typeof (storage as Partial<TransactionalFlagsStorage>).transaction === "function";
}

/** Runtime feature-detection: does this storage implement `compareAndSwap`? */
export function isCompareAndSwap(storage: FlagsStorage): storage is CompareAndSwapFlagsStorage {
  return typeof (storage as Partial<CompareAndSwapFlagsStorage>).compareAndSwap === "function";
}

/**
 * Helper for adapters whose subpath requires an optional peer dependency. Throws
 * a clear, actionable error when the peer is missing.
 */
export function requirePeer(name: string, subpath: string): never {
  throw new Error(
    `@xtandard/flags/${subpath} requires the "${name}" package. Install it with: bun add ${name}`,
  );
}
