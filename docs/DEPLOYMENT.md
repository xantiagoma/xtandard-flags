# Deployment

---

## Standalone Server

The standalone app (`apps/standalone/src/index.ts`) reads all configuration from environment variables and starts a `Bun.serve` listener.

### Environment Variables

| Variable                 | Default                    | Description                                                         |
| ------------------------ | -------------------------- | ------------------------------------------------------------------- |
| `PORT`                   | `3000`                     | TCP port to listen on.                                              |
| `BASE_PATH`              | `""`                       | URL prefix, e.g. `"/flags"`. Must match the path you expose.        |
| `TITLE`                  | `"Xtandard Flags"`         | Title shown in the admin UI and `/healthcheck`.                     |
| `SOURCE_STORAGE_DRIVER`  | `"memory"`                 | Driver for source storage: `redis`, `file`, `unstorage`, `memory`.  |
| `RUNTIME_STORAGE_DRIVER` | `"memory"`                 | Driver for runtime storage: `redis`, `file`, `unstorage`, `memory`. |
| `REDIS_URL`              | `"redis://localhost:6379"` | Redis connection URL (used when driver is `redis`).                 |
| `SOURCE_PREFIX`          | `"xtandard:flags:source"`  | Redis key prefix for source storage.                                |
| `RUNTIME_PREFIX`         | `"xtandard:flags:runtime"` | Redis key prefix for runtime storage.                               |
| `SOURCE_FILE_DIR`        | `"./data/source"`          | Directory for file-backed source storage.                           |
| `RUNTIME_FILE_DIR`       | `"./data/runtime"`         | Directory for file-backed runtime storage.                          |
| `AUTH_MODE`              | `"none"`                   | Authentication mode: `none` or `basic`.                             |
| `AUTH_USERNAME`          | `"admin"`                  | Username for `basic` auth mode.                                     |
| `AUTH_PASSWORD_HASH`     | `""`                       | scrypt hash of the admin password (preferred). See [Auth](AUTH.md). |
| `AUTH_PASSWORD`          | `""`                       | Plaintext password for `basic` auth (dev only).                     |
| `READONLY`               | `false`                    | Set to `1` or `true` to block all mutating operations.              |
| `UI_DIR`                 | resolved from module path  | Override the bundled UI directory (e.g. in custom Docker images).   |

### Healthcheck

The standalone server responds to `GET /healthcheck` (and `GET /{basePath}/healthcheck`) with:

```json
{ "status": "ok", "title": "Xtandard Flags" }
```

This is independent of auth — no credentials are required for the healthcheck endpoint.

---

## Docker

### Build

Build from the **repository root** (the Dockerfile context must be the root):

```bash
docker build -f apps/standalone/Dockerfile -t xtandard-flags .
```

The build is multi-stage:

1. `build` stage: installs dependencies and runs `bun run build:ui`.
2. `runtime` stage: copies `src/`, `dist/ui/`, `node_modules/`, and `apps/standalone/` — no compiled lib needed because Bun runs TypeScript directly.

### Run

Minimal (in-memory storage, no auth — for local testing only):

```bash
docker run --rm -p 3000:3000 xtandard-flags
```

With Redis and basic auth:

```bash
docker run --rm -p 3000:3000 \
  -e SOURCE_STORAGE_DRIVER=redis \
  -e RUNTIME_STORAGE_DRIVER=redis \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e AUTH_MODE=basic \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD_HASH='scrypt$abc123...$def456...' \
  xtandard-flags
```

### Docker Compose with Redis

```yaml
# docker-compose.yml
version: "3.9"
services:
  redis:
    image: redis:7-alpine
    command: redis-server --notify-keyspace-events KEA
    ports:
      - "6379:6379"

  flags:
    build:
      context: .
      dockerfile: apps/standalone/Dockerfile
    ports:
      - "3000:3000"
    environment:
      SOURCE_STORAGE_DRIVER: redis
      RUNTIME_STORAGE_DRIVER: redis
      REDIS_URL: redis://redis:6379
      SOURCE_PREFIX: xtandard:flags:source
      RUNTIME_PREFIX: xtandard:flags:runtime
      AUTH_MODE: basic
      AUTH_USERNAME: admin
      AUTH_PASSWORD_HASH: "${FLAGS_ADMIN_PASSWORD_HASH}"
    depends_on:
      - redis
```

The `notify-keyspace-events KEA` flag on Redis enables keyspace notifications, which allows the OpenFeature provider to pick up new snapshots via watch instead of waiting for the next poll.

---

## Security Warnings

### Authentication

**Always set `AUTH_MODE=basic` (or provide a custom `AuthProvider`) before exposing the admin panel to any network.**

When `AUTH_MODE=none` the standalone server logs:

```
[xtandard/flags] Running with AUTH_MODE=none. Do NOT expose this publicly without authentication.
```

A deployment with no auth and a publicly reachable port allows anyone to read, modify, and publish flags.

### Password Storage

- Use `AUTH_PASSWORD_HASH` (scrypt) rather than `AUTH_PASSWORD` (plaintext) in production.
- Generate a hash with:

```bash
bun -e "const {hashPassword} = await import('./src/auth/basic.ts'); console.log(await hashPassword('your-password'))"
```

- Store the hash in an environment secret (CI secret, Docker secret, Vault), not in source control.

### Readonly Mode

When the admin is embedded in an application that untrusted code can reach, set `readonly: true` (or `READONLY=1`). This blocks all state-changing API calls at the core level, returning `403` for any mutating action regardless of auth.

### Cookie/Session Auth and CSRF

If you implement a delegated `AuthProvider` that uses cookies or sessions, add CSRF protection to your outer request handler. The panel handler does not include CSRF middleware — it is the consumer's responsibility when session-based auth is used.

### Network Exposure

Consider mounting the admin panel on an internal-only port or path:

- Use `BASE_PATH` to namespace the panel under a non-obvious route.
- Place a reverse proxy in front and restrict access by IP or mTLS.
- Run the standalone container on a non-public network and only expose the OpenFeature provider's runtime storage (Redis) to applications.

## Storage driver env vars (Postgres & MongoDB)

The standalone app and CLI accept `postgres` and `mongodb` for
`SOURCE_STORAGE_DRIVER` / `RUNTIME_STORAGE_DRIVER` (alongside `redis`, `unstorage`,
`file`, `memory`). Source and runtime share one connection but are isolated by a
distinct table/collection.

| Driver     | Env vars                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `postgres` | `DATABASE_URL` (or `POSTGRES_URL`); optional `SOURCE_PG_TABLE` / `RUNTIME_PG_TABLE` (default `xtandard_flags_{source,runtime}`)                        |
| `mongodb`  | `MONGO_URL`; optional `MONGO_DB` (default `xtandard_flags`), `SOURCE_MONGO_COLLECTION` / `RUNTIME_MONGO_COLLECTION` (default `flags_{source,runtime}`) |

```bash
# Postgres source + runtime
docker run -p 3000:3000 \
  -e SOURCE_STORAGE_DRIVER=postgres -e RUNTIME_STORAGE_DRIVER=postgres \
  -e DATABASE_URL=postgres://user:pass@db:5432/flags \
  ghcr.io/xantiagoma/xtandard-flags:latest

# MongoDB source + runtime
docker run -p 3000:3000 \
  -e SOURCE_STORAGE_DRIVER=mongodb -e RUNTIME_STORAGE_DRIVER=mongodb \
  -e MONGO_URL=mongodb://db:27017 \
  ghcr.io/xantiagoma/xtandard-flags:latest
```

A common production split: Postgres as `source` (durable, transactional history)
and Redis/Upstash as `runtime` (fast reads).
