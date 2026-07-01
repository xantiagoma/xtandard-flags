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

## Postgres (`@xtandard/flags/storage/postgres`)

Peer dep: `pg` (or pass any client exposing `query(text, params)` — including
[PGlite](https://pglite.dev) for a zero-infra embedded Postgres).

```ts
import { createPostgresStorage } from "@xtandard/flags/storage/postgres";

// Lazily creates a pg Pool:
const storage = createPostgresStorage({ connectionString: process.env.DATABASE_URL! });

// …or pass your own client / PGlite (great for tests, no server needed):
import { PGlite } from "@electric-sql/pglite";
const storage = createPostgresStorage({ client: new PGlite(), table: "xtandard_flags" });
```

Data lives in one table `key text PRIMARY KEY, value jsonb` (auto-created on first
use). `table` defaults to `xtandard_flags` and is validated as a safe identifier.

## Drizzle (`@xtandard/flags/storage/drizzle`)

Peer dep: `drizzle-orm`. Use this instead of the Postgres adapter when you already
use Drizzle and want the flags table to live in **your schema + migrations**
(not auto-created via `CREATE TABLE`) and to **reuse your existing connection**
(the adapter never opens or closes a pool). Works with Postgres, MySQL, and
SQLite Drizzle databases — the upsert dialect is detected at runtime.

**1. Declare the table** with the matching factory and add it to your schema so
`drizzle-kit` generates the migration:

```ts
// schema.ts — pick the factory for your dialect:
import { pgFlagsTable } from "@xtandard/flags/drizzle/pg"; // key text PK, value jsonb
// import { mysqlFlagsTable } from "@xtandard/flags/drizzle/mysql";  // key varchar PK, value json
// import { sqliteFlagsTable } from "@xtandard/flags/drizzle/sqlite"; // key text PK, value text(json)

export const flagsKv = pgFlagsTable("flags_kv");
```

Each factory takes optional `extraColumns()` / `extraIndexes(table)` (mirroring
`drizzle-audit`), plus `schema` (pg) / `keyLength` (mysql).

**2. Build the storage** over your existing `db`:

```ts
import { createDrizzleStorage } from "@xtandard/flags/storage/drizzle";
import { flagsKv } from "./schema.ts";

const storage = createDrizzleStorage({ db, table: flagsKv }); // `db` = your Drizzle instance
```

The Drizzle adapter has **no built-in `watch`** — change notifications are
composable and adapter-agnostic. See [Change notifications](#change-notifications-withwatch)
below to add `watch` from any source (Postgres `LISTEN`/`NOTIFY`, an ORM
write-hook, Redis pub/sub, …). Without it, the runtime provider polls
(`refreshIntervalMs`) — fine for the **source** plane.

## Change notifications (`withWatch`)

`watch` (push-based snapshot refresh) is **orthogonal** to which storage you use,
so it's a composable wrapper rather than an adapter option. `withWatch(storage,
subscribe)` returns a `WatchableFlagsStorage` that delegates all reads/writes to
`storage` and drives `watch` from whatever change source **you** provide. This
gives `watch` to adapters that don't implement it (postgres, drizzle, mongodb,
unstorage, cloudflare-kv, …).

```ts
import { withWatch } from "@xtandard/flags";

// Bring your own source — an ORM write-hook, Redis pub/sub, a websocket, an
// EventEmitter. Call notify(changedKey?) on each change; return an unsubscribe.
const storage = withWatch(base, (notify) => {
  const sub = redis.subscribe("flag-changes", (msg) => notify(msg.key));
  return () => sub.unsubscribe();
});
```

`notify(key?)` filters by the watched prefix; a call with no key is delivered as
a change to the prefix itself (enough to trigger a refresh). Because the source
is yours, this works for **any** dialect (MySQL/SQLite included) using whatever
signal your stack already emits (e.g. an ORM's `onInsert`/`onUpdate`/`onDelete`
hooks).

### Built-in helper: Postgres `LISTEN`/`NOTIFY`

`pgListenNotify(client, channel?)` returns a ready-made source. You own the
trigger (added via your migrations — the adapters issue no DDL) that `pg_notify`s
the channel with the changed key:

```sql
-- migration (yours): notify "xtandard_flags" with the key on every change
CREATE FUNCTION flags_kv_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('xtandard_flags', COALESCE(NEW.key, OLD.key));
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER flags_kv_notify_trg
  AFTER INSERT OR UPDATE OR DELETE ON flags_kv
  FOR EACH ROW EXECUTE FUNCTION flags_kv_notify();
```

```ts
import { withWatch, pgListenNotify } from "@xtandard/flags";
import { Client } from "pg";

const listener = new Client({ connectionString: process.env.DATABASE_URL });
await listener.connect(); // a dedicated Client — a pooled connection won't do

const storage = withWatch(
  createDrizzleStorage({ db, table: flagsKv }), // or createPostgresStorage(...)
  pgListenNotify(listener, "xtandard_flags"),
);
```

## MongoDB (`@xtandard/flags/storage/mongodb`)

Peer dep: `mongodb`.

```ts
import { createMongoStorage } from "@xtandard/flags/storage/mongodb";

const storage = createMongoStorage({
  url: process.env.MONGO_URL!,
  dbName: "xtandard_flags", // default
  collectionName: "flags_kv", // default
});
// …or pass a connected MongoClient via { client }.
```

Documents are `{ _id: <key>, value: <any> }`. `watch` is not implemented (change
streams require a replica set); the provider's polling refresh covers updates.

## unstorage driver ecosystem (`@xtandard/flags/storage/unstorage`)

The unstorage adapter bridges **any** [unstorage driver](https://unstorage.unjs.io/drivers)
into `FlagsStorage` — so you get dozens of backends for free without a dedicated
adapter:

| Driver                                      | Use case                              |
| ------------------------------------------- | ------------------------------------- |
| `unstorage/drivers/upstash`                 | Upstash Redis (serverless / edge)     |
| `unstorage/drivers/vercel-kv`               | Vercel KV                             |
| `unstorage/drivers/cloudflare-kv-binding`   | Cloudflare Workers KV                 |
| `unstorage/drivers/s3`                      | AWS S3 / R2                           |
| `unstorage/drivers/github`                  | GitOps: read flags from a GitHub repo |
| `unstorage/drivers/netlify-blobs`           | Netlify Blobs                         |
| `unstorage/drivers/fs` / `memory` / `redis` | filesystem / memory / Redis           |

```ts
import { createUnstorageStorage } from "@xtandard/flags/storage/unstorage";
import { createStorage } from "unstorage";
import upstash from "unstorage/drivers/upstash";

const storage = createUnstorageStorage({
  storage: createStorage({
    driver: upstash({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    }),
  }),
});
```

A common production pattern: GitHub/file as **source** storage (GitOps, reviewable)
and Upstash/Redis as **runtime** storage (fast edge reads).

## SQLite (`@xtandard/flags/storage/sqlite`) — Bun only

Zero dependencies, backed by `bun:sqlite`. Great for single-node deployments and
local persistence; for multi-node runtimes prefer Redis/Postgres. Requires the
**Bun** runtime (the module is external to the bundle and only resolves under Bun).

```ts
import { createSqliteStorage } from "@xtandard/flags/storage/sqlite";

const storage = createSqliteStorage({ path: "./flags.sqlite" }); // or ":memory:"
// …or pass an existing bun:sqlite Database via { database }.
```

Stored in one table `key TEXT PRIMARY KEY, value TEXT` (auto-created). `table`
defaults to `xtandard_flags`. Standalone/CLI driver: `SOURCE_STORAGE_DRIVER=sqlite`
with `SOURCE_SQLITE_PATH` (run the standalone/CLI under Bun).

## libSQL / Turso (`@xtandard/flags/storage/libsql`)

The SQLite dialect, but against a **remote, replicated, edge-distributed**
database — [Turso](https://turso.tech) / [libSQL](https://github.com/tursodatabase/libsql).
Runs anywhere (Node, Bun, Deno, edge), unlike the Bun-only `bun:sqlite` adapter.
Optional peer dependency: [`@libsql/client`](https://www.npmjs.com/package/@libsql/client).

```ts
import { createLibsqlStorage } from "@xtandard/flags/storage/libsql";

// Turso (remote, with replicas at the edge):
const storage = createLibsqlStorage({
  url: process.env.TURSO_DATABASE_URL!, // libsql://<db>-<org>.turso.io
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

// …or a local file / embedded replica / in-memory:
// createLibsqlStorage({ url: "file:flags.db" });
// createLibsqlStorage({ url: ":memory:" });
// …or pass a pre-constructed client via { client }.
```

One table `key TEXT PRIMARY KEY, value TEXT` (auto-created); `table` defaults to
`xtandard_flags`. Connection is lazy and shared. Call `storage.close()` on shutdown.
A great fit for **runtime storage on the edge**: snapshots replicate close to your
workers, and the provider still serves last-known-good from memory if libSQL blips.

## Cloudflare Workers KV (`@xtandard/flags/storage/cloudflare-kv`)

Wraps a Workers **KV namespace binding** (`env.MY_KV`). **No npm peer dependency** —
the binding is provided by the runtime, so the adapter only needs its structural
type. Works in production Workers, in `wrangler dev` / [Miniflare](https://miniflare.dev)
locally, and against any object satisfying the small `KVNamespaceLike` surface in tests.

```ts
import { createCloudflareKvStorage } from "@xtandard/flags/storage/cloudflare-kv";

export default {
  async fetch(req: Request, env: { FLAGS: KVNamespace }) {
    const storage = createCloudflareKvStorage({ namespace: env.FLAGS, prefix: "runtime" });
    // mount the panel, or build an OpenFeature provider over `storage`
  },
};
```

`prefix` namespaces every key (joined with `:`) and is stripped from `getKeys`,
so several deployments can share one namespace. `getKeys` pages through KV's
cursor automatically. KV is eventually consistent — ideal for read-mostly compiled
snapshots loaded once into memory; prefer Redis/libSQL for the write-heavy
**source** store if you publish frequently from multiple regions.

## Choosing a backend

| Backend        | Adapter                 | Runtime    | Best for                                              |
| -------------- | ----------------------- | ---------- | ----------------------------------------------------- |
| Memory         | `storage/memory`        | any        | tests, single-process experiments                     |
| File           | `storage/file`          | any        | local dev, GitOps drafts in VCS                       |
| Redis          | `storage/redis`         | any        | multi-node, push-based refresh (`watch`)              |
| Postgres       | `storage/postgres`      | any        | you already run Postgres; transactional source        |
| Drizzle        | `storage/drizzle`       | any        | you use Drizzle — table in your migrations, your pool |
| MongoDB        | `storage/mongodb`       | any        | you already run Mongo                                 |
| SQLite         | `storage/sqlite`        | **Bun**    | single-node persistence, zero deps                    |
| libSQL / Turso | `storage/libsql`        | any / edge | edge-replicated runtime, serverless SQLite            |
| Cloudflare KV  | `storage/cloudflare-kv` | Workers    | runtime snapshots inside Cloudflare Workers           |
| Anything else  | `storage/unstorage`     | any        | 20+ drivers (Upstash, Vercel KV, S3/R2, Netlify, …)   |

A common production split is a **durable, transactional source** (Postgres/Redis)
plus a **fast, close-to-the-app runtime** (Redis/libSQL/KV). See the
[storage-combo examples](../examples/README.md).
