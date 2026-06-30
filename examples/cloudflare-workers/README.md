# cloudflare-workers — flags on the edge with Workers KV

Run `@xtandard/flags` entirely inside a Cloudflare Worker: flag **evaluation** and
the admin **API**, backed by two Workers KV namespaces. No origin server, no
database — the whole thing lives at the edge.

| Binding             | Plane            | Holds                           |
| ------------------- | ---------------- | ------------------------------- |
| `env.FLAGS_SOURCE`  | source / control | drafts, snapshot history, audit |
| `env.FLAGS_RUNTIME` | runtime / data   | published snapshots apps read   |

Routes:

- `GET /` — a flag-driven HTML page, evaluated on the edge through the OpenFeature
  provider reading from `FLAGS_RUNTIME`.
- `* /flags/...` — the admin JSON API (auth, CRUD, publish, OFREP, OpenAPI).

## Run locally — no Cloudflare account needed

[`wrangler dev`](https://developers.cloudflare.com/workers/wrangler/) runs the
Worker under **Miniflare**, which simulates KV in memory locally. The placeholder
namespace ids in `wrangler.toml` are never contacted in dev:

```bash
bun install            # pulls wrangler + workers-types (devDependencies)
bunx wrangler dev      # serves on http://localhost:8787
```

Then:

```bash
# 1. See defaults (nothing published yet):
curl http://localhost:8787/

# 2. Create + publish a flag through the edge admin API:
curl -X PUT http://localhost:8787/flags/api/projects/default/environments/production/flags/greeting \
  -H 'content-type: application/json' \
  -d '{"key":"greeting","type":"string","enabled":true,"defaultVariant":"v",
       "variants":{"v":{"value":"Hello from the EDGE!"}},"fallthrough":{"variant":"v"}}'
curl -X POST http://localhost:8787/flags/api/projects/default/environments/production/publish \
  -H 'content-type: application/json' -d '{"message":"edge publish"}'

# 3. Refresh the page — the new value is served from KV:
curl http://localhost:8787/
```

(Exact API paths are in the served OpenAPI doc at `/flags/api/openapi.json`.)

## Deploy

Create real KV namespaces, paste their ids into `wrangler.toml`, then deploy:

```bash
bunx wrangler kv namespace create FLAGS_SOURCE
bunx wrangler kv namespace create FLAGS_RUNTIME
bunx wrangler kv namespace create FLAGS_SOURCE --preview
bunx wrangler kv namespace create FLAGS_RUNTIME --preview
# → paste the printed id / preview_id into the [[kv_namespaces]] blocks
bunx wrangler deploy
```

## Caveat: the admin panel is API-only on Workers

`createFetchHandler` serves the bundled **React admin SPA from the local
filesystem** (`node:fs`). A Worker has no filesystem, so on Workers the panel
serves:

- the full JSON **admin API** under `/flags/api/...` (CRUD, publish, OFREP, OpenAPI), and
- a minimal **fallback HTML page** for `/flags` (not the rich React UI).

`nodejs_compat` is enabled in `wrangler.toml` so the `node:*` imports resolve; the
filesystem reads simply fail and fall through to the fallback page. This is by
design — the API is what you need for programmatic/CI flag management and for the
OFREP evaluation endpoints.

**To get the visual panel** while still evaluating on the edge: run the React
panel from a Node/Bun origin (see [`examples/elysia`](../elysia)) pointed at the
**same** KV namespaces — either via the
[Cloudflare KV REST API](https://developers.cloudflare.com/api/operations/workers-kv-namespace-write-key-value-pair-with-metadata)
through an `unstorage` `cloudflare-kv-http` driver, or by editing locally and
pushing with `wrangler kv key put`. The Worker here remains your fast edge
evaluation layer.

## How it's wired

- The OpenFeature provider is built once per warm isolate and cached at module
  scope, so its in-memory snapshot is reused across requests; KV is read only on
  the background refresh (every 10s) — never on the hot path.
- KV is **not** watchable, so propagation is poll-based (the refresh interval),
  not push-based like the Redis runtime in `examples/postgres-redis`.
