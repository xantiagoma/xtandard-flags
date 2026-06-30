<p align="center">
  <img src="./docs/assets/logo-256.png" alt="@xtandard/flags" width="128" height="128" />
</p>

<h1 align="center">@xtandard/flags</h1>

<p align="center">
  <strong>Self-hosted, embeddable, <a href="https://openfeature.dev">OpenFeature</a>-compatible feature-flag control plane</strong><br/>
  with pluggable storage and <strong>memory-first</strong> runtime evaluation.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@xtandard/flags"><img src="https://img.shields.io/npm/v/@xtandard/flags?color=blue" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@xtandard/flags"><img src="https://img.shields.io/npm/dm/@xtandard/flags" alt="npm downloads" /></a>
  <a href="https://github.com/xantiagoma/xtandard-flags/actions/workflows/ci.yml"><img src="https://github.com/xantiagoma/xtandard-flags/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/xantiagoma/xtandard-flags/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@xtandard/flags" alt="license" /></a>
  <img src="https://img.shields.io/badge/types-included-blue" alt="TypeScript types included" />
</p>

<p align="center">
  Run it <strong>standalone</strong>, <strong>embed</strong> it inside your existing app (Elysia / Hono / Express / Bun / Next.js), or use its <strong>OpenFeature provider</strong> directly.<br/>
  Applications evaluate flags <strong>from memory</strong> — the admin panel is never in the request path.
</p>

<p align="center">
  <img src="./docs/assets/ui-flags.png" alt="The @xtandard/flags admin dashboard" width="860" />
</p>

> **The control plane can be down — and your applications keep evaluating flags.**
> After the first load, evaluation is fully in-process; if storage drops afterward,
> the provider serves the **last-known-good** snapshot (marked `stale`).

---

## Contents

- [Why another flag tool?](#why-another-flag-tool)
- [How it works — the two planes](#how-it-works--the-two-planes)
- [Quickstart](#quickstart)
- [Evaluate flags at runtime (OpenFeature)](#evaluate-flags-at-runtime-openfeature)
- [The flag model](#the-flag-model)
- [Storage backends](#storage-backends)
- [Subpath exports](#subpath-exports)
- [Examples](#examples)
- [Screenshots](#screenshots)
- [CLI](#cli)
- [Docs](#docs)

## Why another flag tool?

Unleash / Flagsmith / GO Feature Flag are great, but most assume a server in (or
near) the request path and a heavier deployment. `@xtandard/flags` owns a narrow,
sharp gap:

- 🏠 **Self-hosted OpenFeature admin** — your data, your infra, no SaaS.
- 🔌 **Pluggable storage** — memory, file, Redis, Postgres, MongoDB, SQLite, **libSQL/Turso**, **Cloudflare KV**, or any [unstorage](https://unstorage.unjs.io) driver. Bring your own with four methods.
- ⚡ **Local-first evaluation** — a tiny, **zero-dependency** evaluator + provider run in-process. The panel can be offline.
- 🧩 **Embeddable or standalone** — mount the panel in your app, or run the Docker image.
- 📦 **One npm package** — explicit subpath exports, optional peer deps; install only what you use.
- 🎛️ **Bundled admin SPA** — consumers mounting the panel **don't install React**.

It is intentionally _not_ a LaunchDarkly clone: no experiment analytics, no hosted
SaaS, no mandatory Redis/Postgres/auth. Batteries included, **not** required —
everything official is just an implementation of a public contract you can replace.

## How it works — the two planes

```mermaid
flowchart LR
  subgraph Admin["🛠️  Admin / control plane"]
    direction TB
    UI["Admin UI / CLI"] --> API["JSON API"]
    API --> SRC[("Source storage<br/>drafts · history · audit")]
    API -- "publish → compile<br/>immutable snapshot" --> RT[("Runtime storage<br/>published snapshots")]
  end

  subgraph App["🚀  Application runtime"]
    direction TB
    PROV["OpenFeature provider"] -- "load snapshot once" --> MEM[["In-memory snapshot"]]
    MEM --> EVAL["Evaluate in-process<br/>(zero deps, never throws)"]
    PROV -. "background refresh<br/>(poll or watch)" .-> RT
  end

  RT --> PROV
```

| Plane                     | What                 | Reads / writes                                                                                  |
| ------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| **Admin / control plane** | UI + JSON API + CLI  | reads/writes **source storage**; compiles immutable snapshots; publishes to **runtime storage** |
| **Application runtime**   | OpenFeature provider | loads a whole **snapshot** into memory; evaluates in-process; refreshes in the background       |

```ts
type FlagsPanelOptions = {
  sourceStorage: FlagsStorage; // canonical: drafts, history, audit
  runtimeStorage?: FlagsStorage; // published snapshots (default = sourceStorage)
};
```

See [ADR 0002 — memory-first runtime evaluation](docs/ADR/0002-memory-first-runtime-evaluation.md).

## Quickstart

### Install

```bash
bun add @xtandard/flags
# optional integrations (peer deps) — install only what you use:
bun add redis pg mongodb @libsql/client unstorage @openfeature/server-sdk elysia hono express
```

### Run the standalone (Docker)

```bash
docker run --rm -p 3000:3000 \
  -e SOURCE_STORAGE_DRIVER=redis -e RUNTIME_STORAGE_DRIVER=redis \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e AUTH_MODE=basic -e AUTH_USERNAME=admin -e AUTH_PASSWORD_HASH='scrypt$...' \
  ghcr.io/xantiagoma/xtandard-flags:latest
```

Visit `http://localhost:3000`. Health check at `/healthcheck`.

### Or embed the admin panel in your app

<details open>
<summary><strong>Elysia</strong></summary>

```ts
import { Elysia } from "elysia";
import { flagsPanel } from "@xtandard/flags/elysia";
import { createRedisStorage } from "@xtandard/flags/storage/redis";
import { basicAuth } from "@xtandard/flags/auth/basic";

new Elysia()
  .mount(
    "/flags",
    flagsPanel({
      basePath: "/flags",
      sourceStorage: createRedisStorage({ url: process.env.REDIS_URL!, prefix: "flags:source" }),
      runtimeStorage: createRedisStorage({ url: process.env.REDIS_URL!, prefix: "flags:runtime" }),
      auth: basicAuth({
        users: [{ username: "admin", passwordHash: process.env.FLAGS_ADMIN_PASSWORD_HASH! }],
      }),
    }),
  )
  .listen(3000);
```

</details>

<details>
<summary><strong>Hono</strong></summary>

```ts
import { Hono } from "hono";
import { flagsPanel } from "@xtandard/flags/hono";
import { createUnstorageStorage } from "@xtandard/flags/storage/unstorage";
import { createStorage } from "unstorage";

const app = new Hono();
app.route(
  "/flags",
  flagsPanel({
    basePath: "/flags",
    sourceStorage: createUnstorageStorage({ storage: createStorage() }),
  }),
);
export default app;
```

</details>

<details>
<summary><strong>Express</strong></summary>

```ts
import express from "express";
import { flagsPanel } from "@xtandard/flags/express";
import { createFileStorage } from "@xtandard/flags/storage/file";

const app = express();
// Mount the panel BEFORE body-parsing middleware — it reads the raw body.
app.use(
  "/flags",
  flagsPanel({ basePath: "/flags", sourceStorage: createFileStorage({ dir: "./.flags" }) }),
);
app.listen(3000);
```

</details>

Then open `http://localhost:3000/flags`, create a flag, and **Publish**.

## Evaluate flags at runtime (OpenFeature)

```ts
import { OpenFeature } from "@openfeature/server-sdk";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

OpenFeature.setProvider(
  createOpenFeatureProvider({
    projectKey: "default",
    environmentKey: "production",
    storage: createRedisStorage({ url: process.env.REDIS_URL!, prefix: "flags:runtime" }),
    refreshIntervalMs: 10_000,
  }),
);

const client = OpenFeature.getClient();
const theme = await client.getStringValue("theme", "normal", {
  targetingKey: user.id,
  country: user.country,
  plan: user.plan,
});
```

After the first load the provider serves **from memory**. If the admin panel goes
away, evaluation is unaffected. If storage goes down _after_ the first load, the
provider keeps serving the **last-known-good** snapshot (marked `stale`). Missing
flags return the caller's default with `FLAG_NOT_FOUND`. The evaluator is pure and
never throws — invalid config falls back to the caller default with `ERROR`.

## The flag model

Every flag — even boolean — is variant-based. Evaluation is a deterministic
order; the **first** thing that resolves wins:

```mermaid
flowchart TD
  A([evaluate flag, context]) --> B{enabled?}
  B -- no --> Z["default variant · DISABLED"]
  B -- yes --> S{"within schedule window?"}
  S -- no --> Z2["default variant · SCHEDULED / EXPIRED"]
  S -- yes --> P{"prerequisites all satisfied?"}
  P -- no --> Z3["default variant · PREREQUISITE_FAILED"]
  P -- yes --> O{"exact override on bucketing key?"}
  O -- yes --> ZO["override variant · STATIC"]
  O -- no --> R{"targeting rule matches? first match wins"}
  R -- yes --> ZR["rule variant · TARGETING_MATCH / SPLIT"]
  R -- no --> F["fallthrough · STATIC / SPLIT"]
```

- **Splits are deterministic**: `same flagKey + same targetingKey + same salt → same variant` (MurmurHash3, never `Math.random`). Weights need not total 100.
- **Targeting rules** are **conditions** combined with **AND / OR / NOT groups** (nest arbitrarily; a flat list is a plain AND). Operators cover equality, membership, string, numeric, **dates** (ISO-8601 / epoch / `Date` / `Temporal` via ordering operators), **semver**, **`inSegment` / `notInSegment`**, and **`matches` / `notMatches`** — a JSON query document evaluated by a pluggable matcher (built-in `regex`, or `sift` / `mingo` via a [registered matcher](docs/OPERATORS.md#query-matchers-matches--notmatches)).
- **Value objects** are understood out of the box for ordering/equality (the whole Temporal family + `BigInt`); for types that don't follow that convention — Dinero, Decimal — register a [**custom comparator**](docs/OPERATORS.md#custom-comparators).
- **Reusable segments** are named audiences referenced by rules; **prerequisites** express flag-to-flag dependencies (acyclic, validated at publish).
- **Scheduled active window** (`schedule.enableAt` / `disableAt`) — outside it the evaluator serves the default variant (`SCHEDULED` / `EXPIRED`); behavioral, checked live, never flips `enabled`.
- **Organizational metadata**: tags, owner, archiving (excluded from snapshots), and advisory **stale detection** (a `lifecycle` policy that only shows a badge — it never changes behavior).

Full reference: [docs/OPERATORS.md](docs/OPERATORS.md).

## Storage backends

One four-method contract; pick the backend per plane (a common split is a durable
**source** and a fast, close-to-the-app **runtime**).

| Backend           | Import                                  | Runtime    | Best for                                            |
| ----------------- | --------------------------------------- | ---------- | --------------------------------------------------- |
| Memory            | `@xtandard/flags/storage/memory`        | any        | tests, single-process experiments                   |
| File              | `@xtandard/flags/storage/file`          | any        | local dev, GitOps drafts in VCS                     |
| Redis             | `@xtandard/flags/storage/redis`         | any        | multi-node, push-based refresh (`watch`)            |
| Postgres          | `@xtandard/flags/storage/postgres`      | any        | durable, transactional source                       |
| MongoDB           | `@xtandard/flags/storage/mongodb`       | any        | you already run Mongo                               |
| SQLite            | `@xtandard/flags/storage/sqlite`        | **Bun**    | single-node persistence, zero deps                  |
| **libSQL/Turso**  | `@xtandard/flags/storage/libsql`        | any / edge | edge-replicated runtime, serverless SQLite          |
| **Cloudflare KV** | `@xtandard/flags/storage/cloudflare-kv` | Workers    | runtime snapshots inside Cloudflare Workers         |
| Anything else     | `@xtandard/flags/storage/unstorage`     | any        | 20+ drivers (Upstash, Vercel KV, S3/R2, Netlify, …) |

```ts
// Bring your own — any object with these four methods is valid storage:
import type { FlagsStorage } from "@xtandard/flags";
const myStorage: FlagsStorage = {
  getItem: (k) => db.get(k),
  setItem: (k, v) => db.set(k, v),
  removeItem: (k) => db.delete(k),
  getKeys: (prefix) => db.keys(prefix),
};
```

Same story for `AuthProvider` and `AuthorizationProvider` — the built-ins
(`auth/none|basic|delegated`, `authorization/none|roles|delegated`) are just
implementations of public contracts. See [docs/STORAGE.md](docs/STORAGE.md).

## Subpath exports

| Import                                                                                               | What                                                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@xtandard/flags`                                                                                    | core types, evaluator, snapshot, `createFlagsCore`, `createFetchHandler` |
| `@xtandard/flags/openfeature`                                                                        | OpenFeature provider                                                     |
| `@xtandard/flags/storage/{memory,file,redis,unstorage,postgres,mongodb,sqlite,libsql,cloudflare-kv}` | storage adapters                                                         |
| `@xtandard/flags/match/sift`                                                                         | sift query matcher for `matches` / `notMatches`                          |
| `@xtandard/flags/auth/{none,basic,delegated}`                                                        | auth providers                                                           |
| `@xtandard/flags/authorization/{none,roles,delegated}`                                               | authorization providers                                                  |
| `@xtandard/flags/{elysia,hono,bun,express}`                                                          | framework adapters                                                       |
| `@xtandard/flags/react`                                                                              | embeddable `<FlagsDashboard/>` component (advanced; React peer)          |
| `@xtandard/flags/testing`                                                                            | in-memory panel + flag builders                                          |

## Examples

Runnable mini-projects in [`examples/`](examples/) — each mounts the panel **and**
shows flags driving real behavior (change a flag, publish, watch the app change):

| Example                                            | Shows                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| [`elysia/`](examples/elysia)                       | Mount the panel + a route whose response a flag controls.            |
| [`hono/`](examples/hono)                           | Same, on Hono.                                                       |
| [`express/`](examples/express)                     | Same, on Express.                                                    |
| [`flags-sdk/`](examples/flags-sdk)                 | Next.js + Vercel Flags SDK; panel mounted + a home page flags drive. |
| [`openfeature-redis/`](examples/openfeature-redis) | Evaluate at runtime via the OpenFeature provider over Redis.         |
| [`storage-drivers/`](examples/storage-drivers)     | One contract, every backend.                                         |
| [`react-embed/`](examples/react-embed)             | Embed `<FlagsDashboard/>` in an existing React app.                  |
| [`standalone-docker/`](examples/standalone-docker) | The Docker image + Redis via `docker compose`.                       |

```bash
bun run build               # build dist/ + dist/ui once
bun run examples:elysia     # → ▶ elysia → http://localhost:NNNN/flags
```

## Screenshots

|                                                     |                                                               |
| --------------------------------------------------- | ------------------------------------------------------------- |
| ![Flag editor](docs/assets/ui-editor.png)           | ![Snapshots with $schema](docs/assets/ui-snapshot-detail.png) |
| **Flag editor** — variants, rules, query targeting  | **Snapshots** — immutable versions, download/import JSON      |
| ![Publish diff](docs/assets/ui-publish-diff.png)    | ![Audit diff](docs/assets/ui-audit.png)                       |
| **Publish** — git-style diff of unpublished changes | **Audit** — per-version diff of every change                  |

## CLI

```bash
xtandard-flags init        # create default project/env + empty draft
xtandard-flags list        # list flags in the draft
xtandard-flags validate    # validate the draft (exit 1 if invalid)
xtandard-flags publish     # compile draft → snapshot → activate
xtandard-flags rollback v3 # re-point active version
xtandard-flags inspect     # print the active snapshot
```

## Docs

- [Architecture](docs/ARCHITECTURE.md) · [Getting started](docs/GETTING_STARTED.md)
- [Storage](docs/STORAGE.md) · [Auth](docs/AUTH.md) · [Authorization](docs/AUTHORIZATION.md)
- [OpenFeature](docs/OPENFEATURE.md) · [UI](docs/UI.md) · [Operators](docs/OPERATORS.md) · [Adapters](docs/ADAPTERS.md)
- [Deployment](docs/DEPLOYMENT.md) · [Testing](docs/TESTING.md) · [Releases](docs/RELEASES.md)
- ADRs in [docs/ADR](docs/ADR/)
- **API reference** (TSDoc): `bun run docs:api` → generates `docs/api` (TypeDoc).

## Project status

Early but functional (`v0.1`). The headless runtime (evaluator, snapshots,
provider, storage), admin API, auth/authz, framework adapters, bundled UI,
standalone Docker app, and CLI are implemented and tested. APIs may still shift
before `1.0`.

## License

MIT © Santiago Montoya
