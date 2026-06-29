# Storage

`@xtandard/flags` uses a pluggable storage layer. The base contract is intentionally minimal — four async methods — so anything from Redis to a database to an in-memory map satisfies it.

---

## The `FlagsStorage` Contract

```ts
import type { FlagsStorage } from "@xtandard/flags";

interface FlagsStorage {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  getKeys(prefix: string): Promise<string[]>;
}
```

All values are JSON-serializable. `getItem` returns `null` (not `undefined`) for missing keys. `getKeys` returns all keys that start with the given prefix.

### Optional Capabilities

Adapters may implement additional interfaces that the core feature-detects at runtime:

| Interface                    | Extra method                                                | Used for                                                |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| `WatchableFlagsStorage`      | `watch(prefix, callback): Promise<() => void>`              | Push-based snapshot refresh in the OpenFeature provider |
| `TransactionalFlagsStorage`  | `transaction<T>(callback): Promise<T>`                      | Multi-key atomic writes                                 |
| `CompareAndSwapFlagsStorage` | `compareAndSwap({ key, expected, next }): Promise<boolean>` | Optimistic concurrency                                  |

Feature-detection helpers are exported from `@xtandard/flags`:

```ts
import { isWatchable, isTransactional, isCompareAndSwap } from "@xtandard/flags";

if (isWatchable(storage)) {
  const off = await storage.watch("flags/", (event) => console.log(event));
}
```

---

## Official Adapters

### Memory — `@xtandard/flags/storage/memory`

Zero dependencies. Values are deep-cloned on every read and write so mutations to returned objects do not affect stored state. Implements `WatchableFlagsStorage` with microtask-scheduled callbacks.

```ts
import { createMemoryStorage } from "@xtandard/flags/storage/memory";

const storage = createMemoryStorage();

// Optionally seed with initial data:
const seeded = createMemoryStorage({
  initial: {
    "flags/projects": ["default"],
  },
});
```

**Options:**

| Option    | Type                      | Description                       |
| --------- | ------------------------- | --------------------------------- |
| `initial` | `Record<string, unknown>` | Optional seed data (key → value). |

**Notes:** Not persistent across restarts. Ideal for tests and local development.

---

### File — `@xtandard/flags/storage/file`

Zero external dependencies (uses `node:fs/promises`). Each key is stored as a pretty-printed `.json` file, mirroring the slash-delimited key layout as a nested directory tree. Implements `WatchableFlagsStorage` via `fs.watch` on the base directory.

```ts
import { createFileStorage } from "@xtandard/flags/storage/file";

const storage = createFileStorage({ dir: "./data/flags" });
```

**Options:**

| Option | Type     | Description                        |
| ------ | -------- | ---------------------------------- |
| `dir`  | `string` | Base directory. Created on demand. |

**Key layout on disk:**

```
./data/flags/
  flags/
    default/
      production/
        active_version.json
        draft.json
        snapshots/
          v1.json
          v2.json
        audit/
          v1.json
```

**Notes:** `watch` is best-effort; recursive watch support varies by platform. Useful for GitOps workflows where the data directory lives in version control.

---

### Redis — `@xtandard/flags/storage/redis`

Requires `redis` (node-redis v4 or v5) as a peer dependency. Lazy connection: the client connects on the first operation. Uses non-blocking `SCAN` cursors for `getKeys` (never `KEYS`). Implements `WatchableFlagsStorage` via Redis keyspace notifications.

```ts
import { createRedisStorage } from "@xtandard/flags/storage/redis";

// Connect by URL:
const storage = createRedisStorage({
  url: "redis://localhost:6379",
  prefix: "myapp:flags:source",
});

// Or pass a pre-connected client:
import { createClient } from "redis";
const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

const storage = createRedisStorage({ client, prefix: "myapp:flags" });

// Disconnect when done:
await storage.close();
```

**Options:**

| Option   | Type              | Description                                                                                      |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| `url`    | `string`          | Redis connection URL. Used when no `client` is provided.                                         |
| `client` | `RedisClientType` | Pre-constructed node-redis client.                                                               |
| `prefix` | `string`          | Namespace prepended to every key with a `:` separator. Stripped from keys returned by `getKeys`. |

The adapter exposes a `close()` method that disconnects the client it created. If you supplied a `client`, `close()` is a no-op and you manage the connection yourself.

**Watch prerequisite:** Redis must be configured with keyspace notifications that cover generic and string events. The minimum recommended setting:

```
notify-keyspace-events KEA
```

Without this, `watch` calls will silently receive no events and the provider falls back to polling only.

---

### Unstorage — `@xtandard/flags/storage/unstorage`

Wraps any [unstorage](https://unstorage.unjs.io) `Storage` instance. You choose and configure the unstorage driver; this adapter normalises its API to `FlagsStorage`. No watch support (use the Redis or file adapter if you need push notifications).

```ts
import { createUnstorageStorage } from "@xtandard/flags/storage/unstorage";
import { createStorage } from "unstorage";
import redisDriver from "unstorage/drivers/redis";

const storage = createUnstorageStorage({
  storage: createStorage({
    driver: redisDriver({ url: process.env.REDIS_URL }),
  }),
});
```

**Options:**

| Option    | Type      | Description                                                  |
| --------- | --------- | ------------------------------------------------------------ |
| `storage` | `Storage` | A pre-constructed unstorage `Storage` instance (any driver). |

**Notes:** unstorage normalizes key separators to `:` internally. The adapter converts them back to `/` so callers always see the keys they wrote. The `unstorage` package must be installed as a peer dependency.

---

## Source vs Runtime Guidance

| Mode           | Source              | Runtime              | When to use                       |
| -------------- | ------------------- | -------------------- | --------------------------------- |
| **Simple**     | any                 | same (default)       | Local dev, all-in-one single node |
| **Dev**        | memory              | memory               | Tests, in-process experiments     |
| **Production** | Redis source prefix | Redis runtime prefix | Separate stores for isolation     |
| **GitOps**     | file storage        | file or Redis        | Draft files in VCS, CI publishes  |

For production, separate the two stores so the runtime store (read by every application instance) is not in the same logical namespace as the admin draft and audit data. Using separate Redis prefixes (`myapp:flags:source` and `myapp:flags:runtime`) achieves this without needing two Redis clusters.

---

## Implementing a Custom Adapter

Any object that satisfies the `FlagsStorage` interface works:

```ts
import type { FlagsStorage } from "@xtandard/flags";

const myStorage: FlagsStorage = {
  async getItem<T>(key: string): Promise<T | null> {
    const row = await db.query("SELECT value FROM flags WHERE key = ?", [key]);
    return row ? (JSON.parse(row.value) as T) : null;
  },
  async setItem<T>(key: string, value: T): Promise<void> {
    await db.query(
      "INSERT INTO flags (key, value) VALUES (?, ?) ON CONFLICT DO UPDATE SET value = ?",
      [key, JSON.stringify(value), JSON.stringify(value)],
    );
  },
  async removeItem(key: string): Promise<void> {
    await db.query("DELETE FROM flags WHERE key = ?", [key]);
  },
  async getKeys(prefix: string): Promise<string[]> {
    const rows = await db.query("SELECT key FROM flags WHERE key LIKE ?", [`${prefix}%`]);
    return rows.map((r) => r.key);
  },
};
```

To opt into watch support, implement `WatchableFlagsStorage`:

```ts
import type { WatchableFlagsStorage, StorageChangeEvent } from "@xtandard/flags";

const watchableStorage: WatchableFlagsStorage = {
  ...myStorage,
  async watch(prefix: string, callback: (event: StorageChangeEvent) => void): Promise<() => void> {
    const sub = myPubSub.subscribe(`flags-changes:${prefix}`, (msg) => {
      callback({ type: msg.type, key: msg.key });
    });
    return () => sub.unsubscribe();
  },
};
```
