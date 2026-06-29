# PLAN — `@xtandard/flags`

> Self-hosted, embeddable, OpenFeature-compatible feature-flag control plane with
> pluggable storage and **memory-first** runtime evaluation.

Single source of truth for *what we are building and in what order*. Day-to-day
status lives in [WORKLOG.md](./WORKLOG.md); the task checklist in [TODO.md](./TODO.md).

## North star

- The admin/control plane can be **down** and applications must still evaluate flags.
- OpenFeature = application-facing evaluation contract.
- `@xtandard/flags` = admin UI, storage, snapshots, evaluator, adapters, auth, provider.
- Batteries included, **not** batteries required: everything official is just an
  implementation of a public contract.

## Tech choices (decided)

| Area | Choice | Why |
|------|--------|-----|
| Runtime / PM | Bun | Project standard (CLAUDE.md). |
| Build | `vite-plus` (`vp pack`) | Matches `@xtandard/lib`; dual ESM/CJS + DTS. |
| UI build | Vite + React + Tailwind v4 | Separate build → `dist/ui`; bundled SPA. |
| Validation | `valibot` | Small, tree-shakeable. Admin path only — evaluator stays dep-free. |
| Hash | hand-rolled MurmurHash3 | Deterministic splits, zero deps in the request path. |
| Tests | Vitest (via `vp test`) + Playwright | unit / integration / type / browser / e2e. |
| Release | Changesets-style (`changelogen`) + GH Actions | Matches sibling repos. |

Key constraint: **evaluator + openfeature provider must have zero runtime deps**
so the request path is tiny and reliable. Validation (`valibot`) lives only in the
admin/compile path.

## Module layout

```
src/
  index.ts            public surface: createFlagsPanel, createFetchHandler, types, contracts
  core.ts             admin operations (CRUD, draft, publish, rollback, audit)
  schema.ts           types (Flag, Variant, Rule, Condition, Snapshot, Draft)
  validation.ts       valibot schemas + validateDraft (admin path only)
  hash.ts             MurmurHash3 → unit interval (zero deps)
  evaluator.ts        evaluateFlag, pickVariant, condition operators (zero deps)
  snapshot.ts         compiler, versioning, storage key layout
  openfeature.ts      createOpenFeatureProvider (memory-first, background refresh)
  testing.ts          in-memory panel + fixtures
  storage/{contract,memory,file,redis,unstorage}.ts
  auth/{contract,none,basic,delegated}.ts
  authorization/{contract,none,roles,delegated}.ts
  server/{create-fetch-handler,routes,static-assets,render-index-html,base-path}.ts
  adapters/{elysia,hono,bun}.ts
  ui/                 React SPA → dist/ui
  entry-*.ts          thin re-export entrypoints mapping to subpath exports
apps/
  standalone/         Bun server + Dockerfile
  playground-elysia/  playground-hono/
examples/
docs/
```

## Phases

- **P0 Bootstrap** — repo scaffold, package.json + exports, tsconfig, vite configs, deps, CI skeleton. ✅ when `vp pack` + `vp test` run on a trivial entry.
- **P1 Core** — schema, validation, hash, evaluator, snapshot + unit/type tests. *Highest priority (eval correctness).*
- **P2 Storage** — contract + memory/file/unstorage/redis + integration tests.
- **P3 OpenFeature provider** — memory-first, refresh, last-known-good + failure-mode tests.
- **P4 Server/API** — fetch handler, routes, auth/authz middleware, static assets, basePath.
- **P5 Auth & Authorization** — contracts + none/basic/delegated, none/roles/delegated.
- **P6 Framework adapters** — elysia, hono, bun (thin wrappers over createFetchHandler).
- **P7 Bundled UI** — React SPA (flag list/editor, variants, rules, overrides, publish, snapshots, rollback) → dist/ui.
- **P8 Standalone + Docker** — env-driven Bun app, /healthcheck, Dockerfile.
- **P9 CLI** — init / validate / publish / rollback / inspect.
- **P10 Docs, examples, CI/CD** — README, docs/*, examples/*, GH Actions (ci/release/docker).

Order follows spec §24 priorities: evaluator → snapshot → provider → failure semantics → storage → API → UI → adapters → docker → CLI.

## Acceptance (spec §22) — tracked in TODO.md

Package installs & subpath exports work · Elysia/Hono mount · bundled UI without consumer React ·
redis/unstorage/memory/file storage · create string flag w/ variants · publish snapshot ·
OpenFeature evaluates · deterministic split · override · basic + delegated auth · roles + delegated authz ·
runtime survives admin down · runtime survives Redis down after load · CI green · Docker /healthcheck · README.
