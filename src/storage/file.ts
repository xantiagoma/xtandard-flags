/**
 * File-system storage adapter. Persists each key as a JSON file under a base
 * directory, mirroring the slash-delimited key layout (`flags/{project}/{env}/…`)
 * as a tree of nested directories with a `.json` extension on the leaf. Each
 * segment is encoded ({@link encodeSegment}) so keys that differ only by case
 * stay distinct on case-insensitive file systems (macOS, Windows). Zero
 * external dependencies — uses `node:fs/promises`, which works in both Bun and
 * Node.
 *
 * The driver is `@xtandard/kit/storage/file`: writes are atomic (temporary file
 * + rename), `compareAndSwap` is serialized per key within one process, and
 * empty key segments are distinct keys. Trees written before segment encoding
 * are read through (`legacy: "read-through"`), as in every earlier release: a
 * raw-named file is read when its encoded twin is missing, and removed on the
 * next write or remove of the key.
 *
 * @module
 */

import * as kit from "@xtandard/kit/storage/file";

export {
  clearFileStorage,
  decodeSegment,
  encodeSegment,
  migrateFileStorage,
  type FileLegacyMode,
} from "@xtandard/kit/storage/file";

/** Options for {@link createFileStorage}. `legacy` defaults to `"read-through"`. */
export type FileStorageOptions = kit.FileStorageOptions;

/** A watchable, compare-and-swap capable file-backed storage. */
export type FileFlagsStorage = kit.FileKvStorage;

/**
 * Create a file-backed {@link FileFlagsStorage}. `watch` is implemented
 * via `fs.watch` on the base directory (recursive); it is best-effort and may
 * coalesce or miss events on platforms without recursive-watch support.
 *
 * @example
 * ```ts
 * import { createFileStorage } from "@xtandard/flags/storage/file";
 *
 * const storage = createFileStorage({ dir: "./data/flags" });
 * ```
 */
export function createFileStorage(options: FileStorageOptions): FileFlagsStorage {
  return kit.createFileStorage({ legacy: "read-through", ...options });
}
