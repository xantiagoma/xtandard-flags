/**
 * Adapter that wraps an [unstorage](https://unstorage.unjs.io) `Storage`
 * instance as a {@link FlagsStorage}. The caller constructs and configures their
 * own unstorage instance (with whatever driver they like) and passes it in — we
 * never import `unstorage` at runtime, only its type. `unstorage` therefore
 * remains an optional peer dependency.
 *
 * unstorage's key normalization is lossy (it cuts at `?`, turns `\` and `/`
 * into `:`, collapses repeated `:` and hides keys ending in `$`), so the adapter
 * escapes `%`, `?`, `\`, `:`, a trailing `$` and empty segments before handing
 * keys over and reverses it on the way back: every key round-trips exactly.
 * Note that file-system unstorage drivers inherit their file system's case
 * sensitivity; prefer `storage/file`, which encodes case.
 *
 * The driver is `@xtandard/kit/storage/unstorage`.
 *
 * @module
 */

export {
  createUnstorageStorage,
  type UnstorageStorageOptions,
} from "@xtandard/kit/storage/unstorage";
