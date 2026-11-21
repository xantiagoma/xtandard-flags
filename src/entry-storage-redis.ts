/**
 * Redis storage: `createRedisStorage` (JSON strings) and `createRedisJSONStorage`
 * (RedisJSON documents), with push-based change notifications. Optional peer
 * dependency: `redis` (node-redis v4 or v5).
 *
 * Subpath entry for `@xtandard/flags/storage/redis`: re-exports the adapters so
 * the bundler can map them to their own dist file.
 *
 * @module storage/redis
 */

export * from "./storage/redis.ts";
