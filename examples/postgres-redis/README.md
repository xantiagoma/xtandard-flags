# postgres-redis — split planes (durable source + fast runtime)

The marquee **production** topology for `@xtandard/flags`: two storage backends,
each doing what it's best at.

| Plane                     | Backend  | Holds                               | Why                                                             |
| ------------------------- | -------- | ----------------------------------- | --------------------------------------------------------------- |
| `sourceStorage` (control) | Postgres | drafts, snapshot history, audit log | durable, transactional, queryable — your system of record       |
| `runtimeStorage` (data)   | Redis    | published snapshots only            | fast, in-memory, **watchable** — apps read this, never Postgres |

`publish()` writes the compiled snapshot to **both** planes. Apps evaluate flags
only from the Redis runtime plane via the OpenFeature provider, which loads
snapshots into memory once and keeps them fresh. Postgres — and the admin panel —
can be down and your apps keep serving last-known-good values.

Because the Redis adapter is **watchable** (keyspace notifications), a Publish in
the panel propagates to every running app within milliseconds. No polling lag, no
database on the request path.

## Run it

```bash
docker compose up -d          # start postgres + redis
bun install
bun run start                 # honors PORT; defaults to 3000
```

Then open:

- <http://localhost:3000> — a demo page whose banner, greeting, and item count are
  all driven by flags resolved through the OpenFeature provider over **Redis**.
- <http://localhost:3000/flags> — the embedded admin panel, writing drafts to
  **Postgres** and publishing snapshots to **both** Postgres and Redis.

Stop with `docker compose down` (add `-v` to wipe the Postgres volume + Redis).

## The edit → publish → see-change loop

1. Open <http://localhost:3000/flags> and flip `new-greeting` to **on** (or change
   `banner-color`).
2. Click **Publish**. The core compiles a snapshot and writes it to Postgres
   (history/audit) and Redis (runtime).
3. Redis fires a keyspace notification; the provider's `watch` subscription
   reloads the snapshot into memory.
4. Refresh <http://localhost:3000> — the page reflects the new values immediately.

Kill the panel process and the demo keeps serving from its in-memory snapshot —
that's the whole point of the split.

## Configuration

Both connection strings come from the environment, with localhost defaults that
match `docker-compose.yml`:

```bash
DATABASE_URL=postgres://flags:flags@localhost:5432/flags
REDIS_URL=redis://localhost:6379
```

The Postgres adapter creates its key/value table (`CREATE TABLE IF NOT EXISTS`)
on first use; the Redis adapter prefixes its keys with `xtandard:flags:runtime`.

> The example needs the `pg`, `redis`, and `@openfeature/server-sdk` peer
> dependencies — `bun install` here pulls them in. Redis must be started with
> `--notify-keyspace-events KEA` (the compose file does this) for `watch` to work.
