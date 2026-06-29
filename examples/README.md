# Examples

Each example is a standalone mini-project — copy it out, `bun install`, run.

| Example                                     | What it shows                                                         |
| ------------------------------------------- | --------------------------------------------------------------------- |
| [`elysia/`](./elysia)                       | Mount the admin panel under `/flags` in an Elysia app (file storage). |
| [`hono/`](./hono)                           | Mount the admin panel under `/flags` in a Hono app (file storage).    |
| [`openfeature-redis/`](./openfeature-redis) | Evaluate flags at runtime via the OpenFeature provider over Redis.    |
| [`standalone-docker/`](./standalone-docker) | Run the standalone Docker image + Redis with `docker compose`.        |

## Try the embedded panel

```bash
cd elysia      # or: cd hono
bun install
bun run start
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
