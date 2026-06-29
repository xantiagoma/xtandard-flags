/**
 * Redis storage adapter built on the [`redis`](https://github.com/redis/node-redis)
 * package (node-redis v4/v5), an optional peer dependency. You can either pass a
 * pre-connected `client` or a `url` to connect lazily on first use. An optional
 * `prefix` is prepended (with a `:` separator) to every key so multiple
 * deployments can share a Redis instance without collisions; the prefix is
 * stripped from keys returned by {@link RedisFlagsStorage.getKeys}.
 *
 * `getKeys` uses a non-blocking `SCAN` cursor (never the blocking `KEYS`
 * command). `watch` is implemented with Redis keyspace notifications; it
 * requires the server to be configured with `notify-keyspace-events` covering
 * generic + string + expiry events (e.g. `KEA`).
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
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  scanIterator(options?: { MATCH?: string; COUNT?: number }): AsyncIterable<string | string[]>;
  duplicate(): RedisLike;
  pSubscribe(pattern: string, listener: (message: string, channel: string) => void): Promise<unknown>;
  disconnect(): Promise<unknown>;
}

/**
 * Create a Redis-backed {@link RedisFlagsStorage}. Connection is lazy: the client
 * is created/connected on the first storage operation and reused thereafter,
 * guarded by a single connection promise so concurrent calls connect once.
 */
export function createRedisStorage(options: RedisStorageOptions): RedisFlagsStorage {
  const { url, prefix } = options;
  const fullPrefix = prefix ? `${prefix}:` : "";
  const ownsClient = !options.client;

  let client: RedisLike | undefined = options.client as RedisLike | undefined;
  let connecting: Promise<RedisLike> | undefined;

  /** Resolve a connected client, creating/connecting on first use. */
  async function getClient(): Promise<RedisLike> {
    if (client?.isOpen) return client;
    connecting ??= (async () => {
      if (!client) {
        let createClient: (opts: { url?: string }) => RedisLike;
        try {
          ({ createClient } = (await import("redis")) as unknown as {
            createClient: (opts: { url?: string }) => RedisLike;
          });
        } catch {
          requirePeer("redis", "storage/redis");
        }
        client = createClient({ url });
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
      const raw = await c.get(toRedisKey(key));
      return raw === null ? null : (JSON.parse(raw) as T);
    },

    async setItem<T>(key: string, value: T): Promise<void> {
      const c = await getClient();
      await c.set(toRedisKey(key), JSON.stringify(value));
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
