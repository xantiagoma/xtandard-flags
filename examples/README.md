# Examples

Each example is a standalone mini-project — copy it out, `bun install`, run.

| Example                                       | What it shows                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`elysia/`](./elysia)                         | Mount the admin panel under `/flags` in an Elysia app (file storage).               |
| [`hono/`](./hono)                             | Mount the admin panel under `/flags` in a Hono app (file storage).                  |
| [`express/`](./express)                       | Mount the admin panel under `/flags` in an Express app (file storage).              |
| [`openfeature-redis/`](./openfeature-redis)   | Evaluate flags at runtime via the OpenFeature provider over Redis.                  |
| [`ofrep/`](./ofrep)                           | Remote evaluation via **OFREP** over plain HTTP — bulk/single, ETag/304, live SSE.  |
| [`ofrep-clients/`](./ofrep-clients)           | Consume flags from **Python, Go, and plain TypeScript** via OpenFeature + OFREP.    |
| [`flags-sdk/`](./flags-sdk)                   | Next.js app using the Vercel Flags SDK via its OpenFeature adapter.                 |
| [`storage-drivers/`](./storage-drivers)       | One contract, every backend — incl. libSQL/Turso + Cloudflare KV.                   |
| [`postgres-redis/`](./postgres-redis)         | **Split planes**: Postgres source (durable) + Redis runtime (fast, watch-based).    |
| [`turso/`](./turso)                           | Edge SQLite via libSQL/Turso; seed → publish → evaluate over a `file:` or Turso db. |
| [`cloudflare-workers/`](./cloudflare-workers) | Panel API + flag evaluation **on the edge** with two Workers KV namespaces.         |
| [`standalone-docker/`](./standalone-docker)   | Run the standalone Docker image + Redis with `docker compose`.                      |

## Storage backends

Every backend implements the same tiny `FlagsStorage` contract, so they're
interchangeable as `sourceStorage` / `runtimeStorage`. Where each is demonstrated:

| Backend                 | Import                                  | Demonstrated in                                                                    |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| memory                  | `@xtandard/flags/storage/memory`        | [`storage-drivers/`](./storage-drivers)                                            |
| file                    | `@xtandard/flags/storage/file`          | [`elysia/`](./elysia), `storage-drivers/`                                          |
| redis                   | `@xtandard/flags/storage/redis`         | [`postgres-redis/`](./postgres-redis), [`openfeature-redis/`](./openfeature-redis) |
| postgres                | `@xtandard/flags/storage/postgres`      | [`postgres-redis/`](./postgres-redis)                                              |
| mongodb                 | `@xtandard/flags/storage/mongodb`       | see **MongoDB** note below                                                         |
| sqlite (`bun:sqlite`)   | `@xtandard/flags/storage/sqlite`        | see **SQLite** note below                                                          |
| libsql / Turso          | `@xtandard/flags/storage/libsql`        | [`turso/`](./turso), `storage-drivers/`                                            |
| cloudflare-kv           | `@xtandard/flags/storage/cloudflare-kv` | [`cloudflare-workers/`](./cloudflare-workers), `storage-drivers/`                  |
| unstorage (dozens more) | `@xtandard/flags/storage/unstorage`     | `storage-drivers/` (commented tour)                                                |

### SQLite (Bun-only)

For a single Bun node, `createSqliteStorage` uses Bun's built-in `bun:sqlite` — no
peer dependency, no server:

```ts
import { createSqliteStorage } from "@xtandard/flags/storage/sqlite";
const storage = createSqliteStorage({ path: "./flags.db" }); // or { path: ":memory:" }
```

It's single-file and Bun-only; reach for [`turso/`](./turso) (libSQL) when you need
the same SQL over the network or replicated to the edge.

### MongoDB

```ts
import { createMongoStorage } from "@xtandard/flags/storage/mongodb"; // bun add mongodb
const storage = createMongoStorage({ url: process.env.MONGO_URL! });
```

Drop it in as `sourceStorage` / `runtimeStorage` exactly like the others — the
[`storage-drivers/`](./storage-drivers) tour wires it behind a `MONGO_URL` guard.

These examples depend on the package via `file:../..`, so they run against your
local checkout. **Build the package once at the repo root first** (the bundled UI
and `dist/` must exist):

```bash
cd ..            # repo root
bun install
bun run build    # builds dist/ (lib) + dist/ui (admin SPA)
```

When using the published package instead, swap the dependency for
`"@xtandard/flags": "^0.1.0"`.

## Run from the repo root (auto-install + free port)

From the repo root, after `bun run build`, convenience scripts install the
example on first use and launch it on a **free port** (via `get-port-please`, so
you can run several at once without collisions):

```bash
bun run examples:elysia            # or: hono | express | flags-sdk
bun run examples:storage-drivers   # script example (no server)
bun run examples:openfeature-redis # needs Redis + published flags
bun run examples:ofrep             # self-contained OFREP wire-protocol demo
bun run examples:ofrep-clients     # boots a server + runs Python/Go/TS OFREP clients
```

Each prints the URL it chose, e.g. `▶ elysia → http://localhost:3001/flags`.

## Try the embedded panel (manually)

```bash
cd elysia      # or: hono, express
bun install
bun run start  # honors PORT; defaults to 3000
# open http://localhost:3000/flags — create a "theme" string flag, then Publish
```

## Then consume it at runtime

```bash
cd ../openfeature-redis
bun install
REDIS_URL=redis://localhost:6379 bun run start
```

Stop the admin app — the runtime keeps evaluating from its in-memory snapshot.
That is the whole point.
