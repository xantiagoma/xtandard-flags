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
- [ ] React SPA: layout, flag list, flag editor (variants/rules/overrides), publish, snapshots, rollback
- [ ] api-client, config bootstrap, basePath-aware assets
- [ ] build → dist/ui; Playwright browser tests

## P8 Standalone + Docker
- [ ] apps/standalone (env parsing, /healthcheck), Dockerfile, smoke test

## P9 CLI
- [ ] init / validate / publish / rollback / inspect

## P10 Docs, examples, CI/CD
- [ ] README + docs/* + ADRs
- [ ] examples: elysia, hono, openfeature-redis, standalone-docker
- [ ] .github/workflows: ci.yml, release.yml, docker.yml
- [ ] publint + pack dry-run
