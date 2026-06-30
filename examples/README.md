# Examples

Each example is a standalone mini-project — copy it out, `bun install`, run.

| Example                                     | What it shows                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| [`elysia/`](./elysia)                       | Mount the admin panel under `/flags` in an Elysia app (file storage).      |
| [`hono/`](./hono)                           | Mount the admin panel under `/flags` in a Hono app (file storage).         |
| [`express/`](./express)                     | Mount the admin panel under `/flags` in an Express app (file storage).     |
| [`openfeature-redis/`](./openfeature-redis) | Evaluate flags at runtime via the OpenFeature provider over Redis.         |
| [`flags-sdk/`](./flags-sdk)                 | Next.js app using the Vercel Flags SDK via its OpenFeature adapter.        |
| [`storage-drivers/`](./storage-drivers)     | One contract, every backend: memory/file/redis/postgres/mongodb/unstorage. |
| [`standalone-docker/`](./standalone-docker) | Run the standalone Docker image + Redis with `docker compose`.             |

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
