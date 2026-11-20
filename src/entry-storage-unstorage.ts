/**
 * Storage over any unstorage driver: `createUnstorageStorage` wraps your own
 * unstorage instance (Upstash, Vercel KV, S3/R2, Netlify Blobs and 20+ more).
 * Optional peer dependency: `unstorage` (types only at runtime).
 *
 * Subpath entry for `@xtandard/flags/storage/unstorage`: re-exports the adapter
 * so the bundler can map it to its own dist file.
 *
 * @module storage/unstorage
 */

export * from "./storage/unstorage.ts";
