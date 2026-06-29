# TODO — `@xtandard/flags`

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

## P0 Bootstrap

- [x] package.json (name, exports map, scripts, deps, peers)
- [x] tsconfig.json · vite.config.ts (pack + test) · vite.ui.config.ts
- [x] .gitignore · mise.toml · LICENSE (MIT) · .npmrc
- [x] install deps; verify `vp pack` + `vp test` on trivial entry

## P1 Core (highest priority)

- [x] src/schema.ts — Flag/Variant/Rule/Condition/Snapshot/Draft types
- [x] src/hash.ts — MurmurHash3 → unit interval
- [x] src/validation.ts — valibot schemas + validateDraft
- [x] src/evaluator.ts — eval order, condition operators, deterministic splits
- [x] src/snapshot.ts — compile draft → snapshot, versioning, key layout
- [x] tests: evaluator, splits (distribution), conditions, snapshot, type tests

## P2 Storage

- [x] storage/contract.ts (FlagsStorage + Watchable/Transactional/CAS)
- [x] storage/memory · file · unstorage · redis
- [x] integration tests (real Redis via docker)

## P3 OpenFeature provider

- [x] openfeature.ts — memory-first, background refresh, last-known-good
- [x] tests: loads snapshot · admin down · redis down after load · missing → defaults

## P4 Server / API

- [x] create-fetch-handler · routes · static-assets · render-index-html · base-path
- [x] auth + authz middleware, readonly mode, audit
- [x] server tests (config, assets, SPA fallback, CRUD, publish, rollback, basePath)

## P5 Auth & Authorization

- [x] auth: contract · none · basic (hash + verifier) · delegated
- [x] authorization: contract · none · roles · delegated
- [x] tests

## P6 Framework adapters

- [x] adapters/elysia · hono · bun + adapter tests

## P7 Bundled UI

- [x] React SPA: layout, flag list, flag editor (variants/rules/overrides), publish, snapshots, rollback
- [x] api-client, config bootstrap, basePath-aware assets
- [x] build → dist/ui; Playwright browser tests

## P8 Standalone + Docker

- [x] apps/standalone (env parsing, /healthcheck), Dockerfile, smoke test

## P9 CLI

- [x] init / validate / publish / rollback / inspect

## P10 Docs, examples, CI/CD

- [ ] README + docs/\* + ADRs
- [x] examples: elysia, hono, openfeature-redis, standalone-docker
- [x] .github/workflows: ci.yml, release.yml, docker.yml
- [x] publint + pack dry-run

## Acceptance criteria (spec §22) — MVP status

- [x] 1. Package installs as `@xtandard/flags`
- [x] 2. Subpath exports work (publint clean, 27 entries)
- [x] 3. Elysia app can mount `/flags`
- [x] 4. Hono app can mount `/flags`
- [x] 5. Bundled UI loads without the consuming app installing React
- [x] 6. Redis storage works (live integration tests + e2e)
- [x] 7. unstorage adapter works
- [x] 8. Memory and file storage work
- [x] 9. Create a string flag with variants (UI + API + tests)
- [x] 10. Publish a snapshot
- [x] 11. OpenFeature provider evaluates that snapshot
- [x] 12. Deterministic split works (distribution tests)
- [x] 13. User override works
- [x] 14. Basic auth works
- [x] 15. Delegated auth works
- [x] 16. Roles authorization works
- [x] 17. Delegated authorization works
- [x] 18. Runtime keeps evaluating from memory when admin is down (e2e)
- [x] 19. Runtime keeps last-known-good when Redis goes down after load (e2e)
- [x] 20. CI defined (.github/workflows/ci.yml) — local gate green
- [x] 21. Docker image boots & serves /healthcheck (standalone smoke-tested; docker.yml smoke job)
- [x] 22. README explains the product clearly

Later / v1 non-goals: postgres adapter, `/react` component export, experiment analytics,
Playwright UI suite in CI, hosted SaaS.

## Post-MVP additions (done)

- [x] Express adapter (`@xtandard/flags/express`) + example
- [x] Postgres storage (`@xtandard/flags/storage/postgres`, pg + PGlite) + standalone/CLI driver + CI live
- [x] MongoDB storage (`@xtandard/flags/storage/mongodb`) + standalone/CLI driver + CI live
- [x] unstorage driver ecosystem documented (Upstash, Vercel KV, Cloudflare KV, S3, GitHub, Netlify Blobs)
- [x] storage-drivers example; examples runnable via file:../.. against local checkout
- [x] CI: mongo + postgres service containers

## /loop round 2 (done)

- [x] UI redesign to v0 reference (top-nav, full-page detail, shadcn neutral+blue, light/dark/system)
- [x] @xtandard/flags/react component export (+ examples/react-embed, verified embedded)
- [x] bun:sqlite storage adapter (+ standalone/CLI driver, bun test, CI)
- [x] e2e expanded to 5 (create, publish, rollback, theme persistence, shell)
- [x] CI green incl. live Redis/Mongo/Postgres + bun:sqlite + build:react + 5 browser e2e
