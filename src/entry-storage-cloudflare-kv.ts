/**
 * Cloudflare Workers KV storage: `createCloudflareKvStorage` over a KV namespace
 * binding, for runtime snapshots read inside Workers. No dependencies.
 *
 * Subpath entry for `@xtandard/flags/storage/cloudflare-kv`: re-exports the
 * adapter so the bundler can map it to its own dist file.
 *
 * @module storage/cloudflare-kv
 */

export * from "./storage/cloudflare-kv.ts";
