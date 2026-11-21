/**
 * Redis storage adapters built on the [`redis`](https://github.com/redis/node-redis)
 * package (node-redis v4/v5), an optional peer dependency. You can either pass a
 * pre-connected `client` or a `url` to connect lazily on first use. An optional
 * `prefix` is prepended (with a `:` separator) to every key so multiple
 * deployments can share a Redis instance without collisions; the prefix is
 * stripped from keys returned by {@link RedisFlagsStorage.getKeys}.
 *
 * Two variants over the same plumbing, differing only in the value encoding:
 *
 * - {@link createRedisStorage} — values are plain **strings** containing JSON
 *   (`SET`/`GET`). Works on any Redis; the default choice.
 * - {@link createRedisJSONStorage} — values are native **RedisJSON** documents
 *   (`JSON.SET`/`JSON.GET`), so the stored data is queryable with JSONPath and
 *   indexable with RediSearch. Requires the JSON module (Redis 8 / Redis Stack).
 *   Do NOT point both variants at the same keys — the types are incompatible
 *   (`WRONGTYPE`).
 *
 * The driver is `@xtandard/kit/storage/redis`: `getKeys` uses a de-duplicated,
 * glob-escaped `SCAN` (never the blocking `KEYS`); `watch` uses keyspace
 * notifications on a glob-escaped pattern and needs `notify-keyspace-events`
 * covering generic + string + expiry events (e.g. `KEA` — whose `A` class also
 * covers the module events that RedisJSON writes emit, e.g. `json.set`);
 * `compareAndSwap` is a Lua script.
 *
 * @module
 */

import * as kit from "@xtandard/kit/storage/redis";

/** Options for {@link createRedisStorage}: `url` or `client`, `prefix`, `onError`, `onWrite`. */
export type RedisStorageOptions = kit.RedisStorageOptions;

/**
 * A watchable, compare-and-swap capable {@link FlagsStorage} backed by Redis,
 * plus a `close()` method that disconnects the client — but only the one this
 * adapter created. A client you passed in is left for you to manage.
 */
export type RedisFlagsStorage = kit.RedisKvStorage;

/** Named in driver errors (a missing peer, a missing `client`/`url`). */
const SUBPATH = "@xtandard/flags/storage/redis";

/**
 * Create a Redis-backed {@link RedisFlagsStorage}. Connection is lazy: the client
 * is created/connected on the first storage operation and reused thereafter,
 * guarded by a single connection promise so concurrent calls connect once.
 *
 * @example
 * ```ts
 * import { createRedisStorage } from "@xtandard/flags/storage/redis";
 *
 * const storage = createRedisStorage({
 *   url: process.env.REDIS_URL ?? "redis://localhost:6379",
 *   prefix: "myapp:flags",
 *   onError: (err) => console.error("[flags/redis]", err),
 * });
 *
 * // Disconnect when the process exits:
 * // process.on("SIGTERM", () => storage.close());
 * ```
 */
export function createRedisStorage(options: RedisStorageOptions): RedisFlagsStorage {
  return kit.createRedisStorage({ subpath: SUBPATH, ...options });
}

/**
 * Create a Redis-backed {@link RedisFlagsStorage} that stores values as native
 * **RedisJSON** documents (`JSON.SET`/`JSON.GET`) instead of strings — making
 * the stored snapshots/drafts queryable with JSONPath (`JSON.GET key $.flags`)
 * and indexable with RediSearch, while the flags system behaves identically.
 *
 * Requires the JSON module on the server (built into Redis 8; Redis Stack; or
 * `redisjson` loaded). Same options and semantics as {@link createRedisStorage},
 * including lazy connection, `SCAN`-based `getKeys`, and keyspace-notification
 * `watch`. **Do not point it at keys written by `createRedisStorage`** (or vice
 * versa) — the underlying types differ and Redis answers `WRONGTYPE`.
 *
 * @example
 * ```ts
 * import { createRedisJSONStorage } from "@xtandard/flags/storage/redis";
 *
 * const storage = createRedisJSONStorage({
 *   url: process.env.REDIS_URL ?? "redis://localhost:6379",
 *   prefix: "myapp:flags",
 * });
 * // Then, in redis-cli: JSON.GET myapp:flags:flags/default/production/snapshots/v1 $.flags
 * ```
 */
export function createRedisJSONStorage(options: RedisStorageOptions): RedisFlagsStorage {
  return kit.createRedisJSONStorage({ subpath: SUBPATH, ...options });
}
