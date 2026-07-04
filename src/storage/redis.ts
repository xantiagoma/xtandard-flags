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
 * `getKeys` uses a non-blocking `SCAN` cursor (never the blocking `KEYS`
 * command). `watch` is implemented with Redis keyspace notifications; it
 * requires the server to be configured with `notify-keyspace-events` covering
 * generic + string + expiry events (e.g. `KEA` — whose `A` class also covers the
 * module events that RedisJSON writes emit, e.g. `json.set`).
 *
 * @module
 */

import type { RedisClientType } from "redis";
import { requirePeer } from "./contract.ts";
import type { StorageChangeEvent, WatchableFlagsStorage } from "./contract.ts";

/** Options for {@link createRedisStorage}. */
export interface RedisStorageOptions {
  /** Connection URL (e.g. `redis://localhost:6379`). Used when no `client` is given. */
  url?: string;
  /** A pre-constructed (optionally pre-connected) node-redis client. */
  client?: RedisClientType;
  /** Optional key namespace prepended to every key, joined with `:`. */
  prefix?: string;
  /**
   * Called on client `error` events (connection drops, reconnect failures).
   * A handler is always attached internally so a downed Redis never crashes the
   * process via an unhandled `error` event — this just lets you observe/log them.
   */
  onError?: (error: unknown) => void;
}

/**
 * A {@link WatchableFlagsStorage} backed by Redis, plus a `close()` method that
 * disconnects the client — but only the one this adapter created. A client you
 * passed in is left for you to manage.
 */
export interface RedisFlagsStorage extends WatchableFlagsStorage {
  /** Disconnect the underlying client if this adapter created it. No-op otherwise. */
  close(): Promise<void>;
}

/** Minimal structural view of the node-redis client surface this adapter uses. */
interface RedisLike {
  isOpen?: boolean;
  on?(event: string, listener: (...args: unknown[]) => void): unknown;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /** RedisJSON module commands (bundled in node-redis; the SERVER needs the module). */
  json?: {
    get(key: string): Promise<unknown>;
    set(key: string, path: string, value: unknown): Promise<unknown>;
  };
  scanIterator(options?: { MATCH?: string; COUNT?: number }): AsyncIterable<string | string[]>;
  duplicate(): RedisLike;
  pSubscribe(
    pattern: string,
    listener: (message: string, channel: string) => void,
  ): Promise<unknown>;
  disconnect(): Promise<unknown>;
}

/** How a variant reads/writes values (the only place the two adapters differ). */
interface RedisValueCodec {
  get(c: RedisLike, key: string): Promise<unknown>;
  set(c: RedisLike, key: string, value: unknown): Promise<void>;
}

/** Plain strings containing JSON — works on any Redis. */
const stringCodec: RedisValueCodec = {
  async get(c, key) {
    const raw = await c.get(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  },
  async set(c, key, value) {
    await c.set(key, JSON.stringify(value));
  },
};

/** Native RedisJSON documents — requires the JSON module on the server. */
const jsonCodec: RedisValueCodec = {
  async get(c, key) {
    const value = await requireJson(c).get(key);
    return value ?? null;
  },
  async set(c, key, value) {
    await requireJson(c).set(key, "$", value);
  },
};

function requireJson(c: RedisLike): NonNullable<RedisLike["json"]> {
  if (!c.json) {
    throw new Error(
      "createRedisJSONStorage: the client exposes no `json` commands — use node-redis " +
        "(the `redis` package) v4+, and a server with the RedisJSON module (Redis 8 / Redis Stack).",
    );
  }
  return c.json;
}

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
  return buildRedisStorage(options, stringCodec);
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
  return buildRedisStorage(options, jsonCodec);
}

/** Shared implementation — connection, prefixing, SCAN, watch, close. */
function buildRedisStorage(
  options: RedisStorageOptions,
  codec: RedisValueCodec,
): RedisFlagsStorage {
  const { url, prefix } = options;
  const fullPrefix = prefix ? `${prefix}:` : "";
  const ownsClient = !options.client;

  let client: RedisLike | undefined = options.client as RedisLike | undefined;
  let connecting: Promise<RedisLike> | undefined;

  // node-redis emits `error` on connection drops and reconnect attempts. Without a
  // listener Node treats it as an unhandled error and crashes the process — which
  // would defeat the whole "storage can be down" promise. Always attach one.
  const attachErrorHandler = (c: RedisLike): void => {
    c.on?.("error", (err: unknown) => options.onError?.(err));
  };
  if (client) attachErrorHandler(client);

  /** Resolve a connected client, creating/connecting on first use. */
  async function getClient(): Promise<RedisLike> {
    if (client?.isOpen) return client;
    connecting ??= (async () => {
      if (!client) {
        let createClient: (opts: Record<string, unknown>) => RedisLike;
        try {
          ({ createClient } = (await import("redis")) as unknown as {
            createClient: (opts: Record<string, unknown>) => RedisLike;
          });
        } catch {
          requirePeer("redis", "storage/redis");
        }
        // disableOfflineQueue: commands reject immediately when the socket is down
        // (instead of queueing forever) so a background snapshot refresh fails fast
        // and the runtime keeps serving last-known-good from memory. The reconnect
        // strategy keeps trying with a capped backoff so it recovers automatically.
        client = createClient({
          url,
          disableOfflineQueue: true,
          socket: { reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000) },
        });
        attachErrorHandler(client);
      }
      if (!client.isOpen) await client.connect();
      return client;
    })();
    try {
      return await connecting;
    } finally {
      connecting = undefined;
    }
  }

  /** Prepend the namespace to a caller key. */
  const toRedisKey = (key: string): string => `${fullPrefix}${key}`;
  /** Strip the namespace off a Redis key, yielding the caller key. */
  const fromRedisKey = (key: string): string =>
    fullPrefix && key.startsWith(fullPrefix) ? key.slice(fullPrefix.length) : key;

  return {
    async getItem<T>(key: string): Promise<T | null> {
      const c = await getClient();
      return ((await codec.get(c, toRedisKey(key))) as T | null) ?? null;
    },

    async setItem<T>(key: string, value: T): Promise<void> {
      const c = await getClient();
      await codec.set(c, toRedisKey(key), value);
    },

    async removeItem(key: string): Promise<void> {
      const c = await getClient();
      await c.del(toRedisKey(key));
    },

    async getKeys(prefix: string): Promise<string[]> {
      const c = await getClient();
      const match = `${toRedisKey(prefix)}*`;
      const out: string[] = [];
      for await (const entry of c.scanIterator({ MATCH: match, COUNT: 100 })) {
        // node-redis v4 yields one key per iteration; v5 may yield batches.
        if (Array.isArray(entry)) {
          for (const k of entry) out.push(fromRedisKey(k));
        } else {
          out.push(fromRedisKey(entry));
        }
      }
      return out;
    },

    async watch(
      prefix: string,
      callback: (event: StorageChangeEvent) => void,
    ): Promise<() => void> {
      // Keyspace notifications publish to `__keyspace@<db>__:<key>`; subscribe to
      // all key events under our namespaced prefix and translate them.
      const c = await getClient();
      const subscriber = c.duplicate();
      attachErrorHandler(subscriber);
      await subscriber.connect();
      const pattern = `__keyspace@*__:${toRedisKey(prefix)}*`;
      await subscriber.pSubscribe(pattern, (event: string, channel: string) => {
        const idx = channel.indexOf("__:");
        if (idx === -1) return;
        const redisKey = channel.slice(idx + 3);
        const key = fromRedisKey(redisKey);
        if (!key.startsWith(prefix)) return;
        const type: StorageChangeEvent["type"] =
          event === "del" || event === "expired" ? "remove" : "update";
        callback({ type, key });
      });
      return () => {
        void subscriber.disconnect();
      };
    },

    async close(): Promise<void> {
      if (ownsClient && client?.isOpen) await client.quit();
    },
  } satisfies RedisFlagsStorage;
}
