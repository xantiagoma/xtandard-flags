/**
 * MongoDB storage adapter built on the [`mongodb`](https://github.com/mongodb/node-mongodb-native)
 * driver, an optional peer dependency. You can either pass a pre-constructed
 * (optionally pre-connected) `MongoClient`, or a connection `url` to create and
 * connect a client lazily on first use.
 *
 * The backend is a single collection of `{ _id: <key>, value: <any> }` documents.
 * The flag key is stored verbatim as the document `_id`, and the value is stored
 * directly as a BSON field (with sorted fields, so compare-and-swap is
 * key-order-insensitive).
 *
 * The driver is `@xtandard/kit/storage/mongodb`. `dbName` defaults to
 * `"xtandard_flags"` and `collectionName` to `"flags_kv"`, as in every earlier
 * release.
 *
 * ## Why no `watch`
 *
 * MongoDB change streams require a replica set or sharded cluster — they are
 * unavailable on a standalone `mongod`. To keep this adapter usable against any
 * deployment, `watch` is intentionally **not** implemented; the core
 * feature-detects its absence and falls back to polling.
 *
 * @module
 */

import * as kit from "@xtandard/kit/storage/mongodb";

/**
 * Options for {@link createMongoStorage}. `dbName` defaults to
 * `"xtandard_flags"`, `collectionName` to `"flags_kv"`.
 */
export type MongoStorageOptions = kit.MongoStorageOptions;

/**
 * A compare-and-swap capable {@link FlagsStorage} backed by MongoDB, plus a
 * `close()` method that disconnects the client — but only the one this adapter
 * created. A client you passed in is left for you to manage.
 */
export type MongoFlagsStorage = kit.MongoKvStorage;

/**
 * Create a MongoDB-backed {@link MongoFlagsStorage}. Connection is lazy: the
 * client is created/connected on the first storage operation and reused
 * thereafter.
 *
 * @example
 * ```ts
 * import { createMongoStorage } from "@xtandard/flags/storage/mongodb";
 *
 * const storage = createMongoStorage({
 *   url: process.env.MONGODB_URL ?? "mongodb://localhost:27017",
 *   dbName: "myapp",
 *   collectionName: "flags_kv",
 * });
 *
 * // Disconnect when the process exits:
 * // process.on("SIGTERM", () => storage.close());
 * ```
 */
export function createMongoStorage(options: MongoStorageOptions): MongoFlagsStorage {
  return kit.createMongoStorage({
    subpath: "@xtandard/flags/storage/mongodb",
    ...options,
    dbName: options.dbName ?? "xtandard_flags",
    collectionName: options.collectionName ?? "flags_kv",
  });
}
