/**
 * Cloudflare Workers KV storage adapter. It wraps a `KVNamespace` **binding** —
 * the object Workers exposes on `env.MY_KV` — so it works in production Workers,
 * in local dev via `wrangler dev` / [Miniflare](https://miniflare.dev), and in
 * tests against any object that satisfies the small {@link KVNamespaceLike}
 * surface. There is **no npm peer dependency**: the binding is provided by the
 * runtime, so this adapter only needs the structural type.
 *
 * KV is eventually consistent and has a ~25 MB per-value limit and list
 * pagination — all fine for compiled flag snapshots, which are read-mostly and
 * loaded once into memory. An optional `prefix` namespaces every key (joined with
 * `:`) and is stripped from {@link CloudflareKvFlagsStorage.getKeys} results, so
 * several deployments can share one namespace.
 *
 * ```ts
 * import { createCloudflareKvStorage } from "@xtandard/flags/storage/cloudflare-kv";
 *
 * export default {
 *   async fetch(req: Request, env: { FLAGS: KVNamespace }) {
 *     const storage = createCloudflareKvStorage({ namespace: env.FLAGS, prefix: "runtime" });
 *     // …mount the panel or build an OpenFeature provider over `storage`…
 *   },
 * };
 * ```
 *
 * @module
 */

import type { FlagsStorage } from "./contract.ts";

/** The subset of the Workers `KVNamespace` binding this adapter uses. */
export interface KVNamespaceLike {
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor?: string }>;
}

/** Options for {@link createCloudflareKvStorage}. */
export interface CloudflareKvStorageOptions {
  /** The KV namespace binding (e.g. `env.FLAGS`). */
  namespace: KVNamespaceLike;
  /** Optional key namespace prepended to every key, joined with `:`. */
  prefix?: string;
}

/** A {@link FlagsStorage} backed by a Cloudflare KV namespace binding. */
export type CloudflareKvFlagsStorage = FlagsStorage;

/**
 * Create a Cloudflare KV–backed {@link FlagsStorage} from a `KVNamespace` binding.
 *
 * @example
 * ```ts
 * import { createCloudflareKvStorage } from "@xtandard/flags/storage/cloudflare-kv";
 * const storage = createCloudflareKvStorage({ namespace: env.FLAGS });
 * ```
 */
export function createCloudflareKvStorage(
  options: CloudflareKvStorageOptions,
): CloudflareKvFlagsStorage {
  const { namespace } = options;
  const fullPrefix = options.prefix ? `${options.prefix}:` : "";
  const toKey = (key: string): string => `${fullPrefix}${key}`;
  const fromKey = (key: string): string =>
    fullPrefix && key.startsWith(fullPrefix) ? key.slice(fullPrefix.length) : key;

  return {
    async getItem<T>(key: string): Promise<T | null> {
      const raw = await namespace.get(toKey(key), "text");
      return raw === null ? null : (JSON.parse(raw) as T);
    },

    async setItem<T>(key: string, value: T): Promise<void> {
      await namespace.put(toKey(key), JSON.stringify(value));
    },

    async removeItem(key: string): Promise<void> {
      await namespace.delete(toKey(key));
    },

    async getKeys(prefix: string): Promise<string[]> {
      const match = toKey(prefix);
      const out: string[] = [];
      let cursor: string | undefined;
      // KV list is paginated; page through until complete.
      do {
        const page = await namespace.list({ prefix: match, cursor });
        for (const k of page.keys) out.push(fromKey(k.name));
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return out;
    },
  } satisfies CloudflareKvFlagsStorage;
}
