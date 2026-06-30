# WORKLOG — `@xtandard/flags`

Reverse-chronological. Each entry: timestamp · task · files · tests · blocker · next.

---

## 2026-06-30 — interactive review round: UX polish, routing, branding, new operators

Driven by a live review (the user clicking through the demo and asking "why is this clunky / what about X"). All small, CI-green commits; main green throughout. Demo: `bun run demo` → seeded standalone on :7788.

- **Editable variant keys** (`11a43ee`): the variant _key_ (not just display name) is editable, with a cascading rename — `renameVariantInFlag` (`src/ui/lib/variants.ts`) rewrites defaultVariant, rule/fallthrough serves, split legs, overrides; refuses empty/dup.
- **Creatable project/env combobox** (`ebd3ea5`): replaced the `<select>` switchers with a Base UI Combobox — select-style trigger + in-popup search + "Create …" item calling createProject/createEnvironment. (Gotcha: a controlled selection `value` object made Base UI wipe the input mid-keystroke; fixed by trigger+in-popup-search.)
- **URL routing** (`7caf71b`, ADR 0005): wouter, pluggable location. Bundled SPA → browser history at basePath (SPA catch-all already exists); `<FlagsDashboard>` → hash by default (+`routing` prop hash|browser|memory|hook, `routerBase`). project/env in `?project&env`. FlagsView/SegmentsView refactored from internal selection state to route-driven (selectedKey + onOpen/onBack).
- **Snapshot detail route + filters in URL** (`e43246f`): `/snapshots/:version`; flags list `?tab=archived` + `?q=` via useSearchParams. New-flag modal stays ephemeral.
- **Audit fixes**: append-only audit (`fix(snapshot)` — was keyed by version, so a rollback to v1 overwrote v1's publish; now an ordered `AuditEntry[]` under `audit-log`). Also fixed an audit-view crash (`d34de75` — `by` is an Actor object, UI rendered it raw → React #31) + dropped the always-empty Flag column.
- **Branding** (`@xtandard/flags` default everywhere; `5770b24` configurable navbar logo): `createFetchHandler({ title, logoUrl, hideIcon })` → `/config` + bootstrap → navbar; `TITLE`/`LOGO_URL`/`HIDE_ICON` env; `<FlagsDashboard>` props. Navbar wordmark was hardcoded before.
- **Demo + run scripts**: `bun run demo` (boots in-memory standalone + seeds), `bun run seed:demo` (`scripts/seed-demo.ts`, comprehensive), and `bun run examples:<name>` (`scripts/example.ts`) with **free-port selection via get-port-please** (server examples honor `PORT` now).
- **Flags SDK example** (`2221894`): `examples/flags-sdk` — Next.js app consuming us through the Vercel Flags SDK's OpenFeature adapter (`@flags-sdk/openfeature`). Self-contained (own deps/tsconfig, excluded from shared examples tsconfig); verified with `next dev`.
- **Operators**: chip input for `in`/`notIn` (`b0af9d1` — no more commas; `TagInput` gained `lowercase={false}`); reordered the picker by frequency, semver last (`14c2e1b`); **`before`/`after` date operators** (`9d8773e`); **`notInSegment`** (`bd550c0` — negated membership; can't inline a negated AND, so resolved segments are embedded in `Snapshot.segments` when used, evaluator checks membership cycle-guarded); **generalized comparable ordering** (`6077250` + follow-up): `>`/`<`/`before`/`after` go through `compareValues → -1|0|1` with three tiers — (1) **value-object compare**: read the class off the instance's `constructor` and use its static `compare` + parser (`from`/`fromString`/`fromJSON`/`parse`) — **no `globalThis.Temporal`, no hardcoded type list**, so it covers the whole Temporal family AND any custom Comparable following the convention; (2) **BigInt** exact; (3) numeric scalar `toComparable` (number/numeric string/ISO date/`Date`/`valueOf`). Never throws; PlainMonthDay (no compare) + calendar-unit Durations (need relativeTo) fail closed; **time-unit Durations (PT1H/PT50M) compare directly**. (Earlier rev used a `globalThis.Temporal` name list + a polyfill test; replaced by the constructor-duck-typed approach — no polyfill dep, tested with a custom `from`/`compare` class which is the exact same code path.) Parser fallback chain: static `from`/`fromString`/`fromJSON`/`parse` → `new Klass(v)` → `Klass(v)`. **Equality** (`equals`/`in`/…) also understands value objects/bigint now (via `compareValues === 0`) while keeping primitive string-loose semantics. Refactored the coercion try/catches to a tiny inlined `tryCatchSync` (`src/try-catch.ts`, mirrors `@xtandard/lib`, no dep) for readability.
- **Evaluator signature** is now `evaluateFlag(flag, context, allFlags?, segments?)` (both back-compat optional). `matchesRule`/`evaluateCondition` take an optional segments map.
- **Docs**: README flag model + new `docs/OPERATORS.md`; `docs/UI.md` (routing/branding/demo); `docs/DEPLOYMENT.md` env vars; ADRs 0004 (OFREP) + 0005 (UI routing).
- **Learning saved to memory**: run `bun run format` before _every_ commit incl. docs-only — CI `format:check` covers `.md` (a worklog-only commit went red once).

**Next / not done:** npm publish still gated on user (NPM_TOKEN + tag). Possible follow-ups noted in conversation: multi-segment OR / richer segment builder (needs OR in rules), `Temporal.Duration`/`PlainDate` operators, a settings UI for branding. Append-only audit storage is per-env list (fine for admin write volume; not CAS-guarded).

## 2026-06-29 — optional backlog Phases A–D (archiving, lifecycle, owner, bootstrap, segments, prerequisites, OFREP)

Worked the handoff's optional backlog in order; each phase a small PR-sized, CI-green commit (commits `f4d6172`…`d1304e5`). 440 vitest (44 new) + 6 browser e2e, all green incl. coverage with live Redis/Mongo/Postgres.

- **A1 — Flag archiving** (`archivedAt`): excluded from compiled snapshots (leaves SDK payloads), kept in the draft for restore. `core.archiveFlag/restoreFlag` + `POST …/flags/:key/archive|restore`. UI: Active/Archived filter + per-row archive/restore.
- **A2 — Stale / lifecycle**: `upsertFlag` stamps `createdAt`/`updatedAt`; optional `expectedLifetimeDays`. Pure `flagStaleness`/`summarizeLifecycle` in `src/lifecycle.ts` (root-exported). UI: stale badge + health warning + lifetime field; UI mirror in `src/ui/lib/lifecycle.ts`.
- **A3 — Owner metadata**: optional `owner {name,email?,team?}`; UI fields + searchable + shown on rows.
- **A4 — Bootstrap endpoint**: `POST …/bootstrap` → `{ flags: { key: {value,variant,reason} } }` (active snapshot), for client prefetch.
- **B — Reusable segments** (effort M): `Segment {key,name?,conditions[]}` referenced via new `inSegment` operator (value = segment key). `src/segments.ts` inlines them into rule conditions at **compile time** (nested + cycle detection) → evaluator/snapshot stay segment-free (no evaluator signature change). CRUD API + segment refs validated at publish (dangling/cyclic → 422). UI: Segments tab + builder (reuses extracted `ConditionRow`) + `inSegment` picker in the rule editor. (Relaxed `conditionSchema.attribute` to allow empty for `inSegment`; attribute-required moved to the per-operator semantic check.)
- **C — Prerequisites** (effort M): `prerequisites {flagKey,variant}[]`. Evaluator signature now `evaluateFlag(flag, context, allFlags?)` (back-compat); checked after the enabled gate, before overrides/rules; unmet/missing/cyclic → default with new reason `PREREQUISITE_FAILED`. Provider passes `snapshot.flags`; `core.evaluate` builds the resolved (segment-inlined) map and threads it. `validatePrerequisiteGraph` (dangling + DFS cycle) runs in `validateDraft`. UI: Prerequisites editor (flag + required-variant pickers).
- **D — OFREP**: `POST /ofrep/v1/evaluate/flags` (+ `/{key}`) reusing `core.evaluate(active)`; OpenFeature-shaped JSON; same auth + `flag:read`; project/env default w/ query override. `src/server/ofrep.ts` payload shaping. ADR `0004-ofrep-endpoint.md` documents the request-path caveat (opt-in; in-process provider stays recommended).

Every phase: OpenAPI schema/paths updated, Eden-typed Elysia surface updated where applicable. Learning: run `bun run typecheck` (it checks `test/*.ts`) _after_ writing tests — a test type error slipped the A3 commit red and was fixed in A4.

**Next (Phase E, only if asked):** scheduling, approval workflows, experiment analytics — large (scheduler/state/reviewer-auth/analytics infra).

## 2026-06-29 — /loop: TSDoc, coverage 96.7%, OpenAPI, Eden-typed Elysia

- **Docs/TSDoc:** `@example` blocks across the public API (they ship in the `.d.ts`, so consumer IDE hover shows usage); TypeDoc API reference via `bun run docs:api`.
- **Coverage:** 78% → **96.68% statements / 90% branch / 97.8% lines / 98% funcs** (+157 tests, 376 total; every source file ≥90%). Enforced in CI via thresholds (92/85/90/92) running `test:coverage` with live Redis/Mongo/Postgres; `retry: 2` for rare pub-sub/timer flakes; sqlite (Bun-only) excluded from vitest cov. Caught: format:check (oxfmt) had to run before commit.
- **OpenAPI 3.1:** `buildOpenApiDocument()` (paths + component schemas), served at `{basePath}/api/openapi.json`, and exposed via `handler.openapi()` / `flagsPanel(...).openapi()` on every adapter for host-app doc merging (better-auth style). Exported from the package root.
- **Eden-typed Elysia plugin:** `flagsElysia({ prefix, sourceStorage })` declares the admin routes (Elysia `t` schemas) so `@elysiajs/eden` treaty types them — `client.flags.api.projects({projectKey}).environments({environmentKey}).flags.get()`. Handlers delegate to the shared fetch pipeline (auth/validation reused). Proven by an in-process treaty test (4/4). `flagsPanel` (opaque mount) kept for the simple case.
- CI green: build job (coverage+services, build lib/ui/react, publint, pack) + browser-e2e 5/5.

## 2026-06-29 — /loop: competitor research → evaluation tester + flag tags

- **Researched** flag-management features across LaunchDarkly, Harness FME (Split), Flagsmith, Unleash, GrowthBook, GO Feature Flag, ConfigCat, PostHog, and the OpenFeature/OFREP spec (subagent, with sources). Built a value×effort matrix.
- **Shipped the top "valuable + easy" wins:**
  - **Evaluation tester** (#1 by value) — `core.evaluate({context,flagKey?,source})` + `POST /evaluate` + a "Test targeting" UI panel (enter targetingKey/attributes → see served value + reason) + CLI `eval`. Reuses the existing evaluator; no engine changes. Every major platform has this (LD reasons, GrowthBook Evaluation Diagnostics, Split test targeting).
  - **Flag tags** — optional `tags: string[]`, TagInput in the detail, chips on list rows, search filter. Universal organizational feature.
- **Researched-but-deferred (menu for later):** flag archiving (S), stale/lifecycle detection (S), owner metadata (S), client bootstrap endpoint (S), OFREP endpoint (M — note: serving eval from the control plane partly conflicts with our "admin never in the request path" promise; in-process/provider stays the recommended path), scheduling (L), approval workflows (L), reusable segments (M), prerequisites (M).
- All CI-green: tsc/lint clean, build+publint, vitest + bun:sqlite + 5 browser e2e.

## 2026-06-29 — /loop: v0-style UI redesign, React component export, sqlite, expanded e2e

- **UI redesign to the v0 reference** (`/Users/santi/Downloads/feature-flag-ui`): replaced the sidebar/drawer + emerald look with a **top-nav layout**, **full-page flag detail** (not a drawer), shadcn token system (neutral + single blue accent), light-first with `data-theme` dark, `@base-ui-components/react` + `lucide-react` + `cn()`. Bound to the real API. Kept system/light/dark switcher in the nav. Verified both themes + all screens (list/detail/snapshots/audit) via Playwright. (Earlier emerald theme was the "meh" the user flagged.)
- **`@xtandard/flags/react`** — embeddable `<FlagsDashboard apiBaseUrl/>` (advanced UI mode). `api.ts` gained `setApiBase()`. Separate vite lib build → `dist/react.js` + `dist/react.css` (react/react-dom external, TanStack Query bundled) + types via `tsconfig.react.json`. **Verified rendering embedded** in a host app (`examples/react-embed`, Vite proxy → standalone) — screenshot in docs/assets.
- **`bun:sqlite`** storage adapter (Bun-only, externalized, standalone/CLI driver, 6 bun tests, CI `test:bun`).
- **e2e expanded to 5** (added rollback + theme-persistence).
- **CI green on GitHub**: build job (Redis+Mongo+Postgres live, bun:sqlite, build lib+ui+react, publint, pack) + browser-e2e (5 passed).

## 2026-06-29 — /loop: more adapters & storage backends (feature-complete on named scope)

- **Task:** Per /loop — Express adapter; Postgres, MongoDB storage; document unstorage's driver ecosystem (Upstash etc.). Fanned out Postgres + MongoDB subagents; built Express myself.
- **Added:**
  - `@xtandard/flags/express` — Node req/res ↔ web Request/Response bridge (4 tests).
  - `@xtandard/flags/storage/postgres` — `createPostgresStorage` over a `key text / value jsonb` table; any `{query}` client (pg Pool OR PGlite). 16 tests via PGlite.
  - `@xtandard/flags/storage/mongodb` — `createMongoStorage` over `{_id,value}`. 15 tests live (Mongo 7).
  - unstorage adapter already bridges Upstash / Vercel KV / Cloudflare KV / S3 / GitHub / Netlify — documented + storage-drivers example.
  - Standalone app + CLI gained `postgres`/`mongodb` drivers (source/runtime isolated by table/collection). Verified end-to-end (standalone CRUD+publish on both; CLI persisting to a real Postgres table, rows confirmed via psql).
  - CI: mongo:7 + postgres:16 service containers → live suites run on GitHub (CI green).
  - Examples now runnable in-repo via `file:../..`; express + storage-drivers added.
- **Bugs caught while testing:** (1) the CLI bin runs `dist/cli.mjs` — must rebuild after editing `src/cli.ts` or the postgres/mongo cases silently fall back to file storage. (2) postgres-docker accepts connections during initdb then restarts — wait for the _second_ "ready to accept connections".
- **State:** 208 tests (live mongo) + 16 pglite + redis/postgres live in CI · tsc/lint clean · build + publint green · CI + Docker workflows green on GitHub.

## 2026-06-29 — Playwright UI e2e + create-flow bug fix + pushed to GitHub

- **Task (continuation):** Real browser e2e suite (spec §17.6) and push the repo.
- **Bug caught by e2e:** the "New flag" modal collected key/type but never passed them to `FlagEditor` (`seedFlag` computed but not wired) — the editor opened blank and **flags could not be created through the UI at all**. Manual screenshots missed it because I'd seeded flags via the API. Fixed by threading a `seed` prop into FlagEditor.
- **Added:** `playwright.config.ts` (boots standalone server, memory storage) + `e2e/ui.spec.ts` (loads shell → create boolean flag via modal+editor → publish → verify snapshot in history). 3/3 pass. CI `browser-e2e` job added.
- **Pushed** to `git@github.com:xantiagoma/xtandard-flags.git` (`main`). CI/Docker workflows will run on GitHub.
- **State:** lint/tsc clean · unit+integration green · redis e2e green · UI e2e green · build green · publint clean.

## 2026-06-29 — P7–P10 complete + MVP done (178 tests, real-Redis e2e green)

- **Task:** Bundled UI, standalone+Docker, CLI, docs, examples, CI, and the critical resilience e2e.
- **Result:**
  - **UI** (subagent, retried once after a flaky first run): React 19 + Vite + Tailwind v4 dark dashboard → `dist/ui`. Verified via Playwright screenshots against the live server — flags list, full flag editor (variants/rules/conditions/splits/overrides), snapshots+rollback, audit. Zero console errors. Screenshots in `docs/assets/`.
  - **Standalone**: env-driven Bun server (`/healthcheck`) + multi-stage Dockerfile. Smoke-tested end-to-end (healthcheck/config/create/publish/SPA).
  - **CLI** `xtandard-flags`: init/list/validate/publish/rollback/inspect (bin + dist/cli). Tested.
  - **Docs** (subagent): README + 11 guides + 3 ADRs. **Examples**: elysia/hono/openfeature-redis/standalone-docker. **CI**: ci/release/docker workflows + changesets.
  - **Bug fixed:** snapshots API now returns rich summaries `{version,publishedAt,by,message}` (UI table needed metadata); exposed auth/authz contract types from package root.
  - **Robustness fix:** Redis adapter attaches an `error` handler (always) + `disableOfflineQueue` + bounded reconnect, so a downed Redis fails fast instead of crashing the process or hanging refresh.
  - **Critical e2e (`e2e/resilience.ts`, `bun run e2e:redis`)** with REAL Redis + Docker: publish → evaluate → stop Redis → provider STILL serves last-known-good (stale=true) for existing AND new users. **The product promise holds.** (Acceptance §22.18 & §22.19.)
- **Final state:** `vp lint` clean · `tsc` clean · **178 tests pass with live Redis** (0 skipped) · `vp pack` + UI build green · publint "All good!".
- **Next:** optional polish — Playwright UI e2e in CI, postgres adapter, `/react` component export (v1 non-goals).

## 2026-06-29 — P1–P6 complete: headless library builds & passes (167 tests)

- **Task:** Build core, storage, OpenFeature provider, auth/authz, server/API, framework adapters. Fanned out 3 background subagents (storage, auth+authz, openfeature) against the stable contracts; built core+server+adapters myself.
- **Result:** `vp pack` builds the full exports map (27 entries × ESM/CJS/DTS = 75 files). `tsc --noEmit` clean. `vp test` → 167 passed, 5 skipped (Redis-live, run when `REDIS_URL` set). publint clean except `./ui/*` (UI not built yet).
- **Files:** src/{schema,keys,hash,evaluator,validation,snapshot,core,testing,index}.ts; src/storage/{contract,memory,file,unstorage,redis}.ts; src/auth/{contract,none,basic,delegated}.ts; src/authorization/{contract,none,roles,delegated}.ts; src/server/{base-path,routes,render-index-html,static-assets,create-fetch-handler}.ts; src/adapters/{bun,elysia,hono}.ts; all entry-_.ts; test/_ (18 files).
- **Discoveries:**
  - `vp pack` emits `dist/<basename>.{mjs,cjs,d.mts,d.cts}` for each pack entry + shared chunks. Flat `entry-*.ts` naming maps cleanly to the exports map.
  - murmur3 impl verified against Bun's `Bun.hash.murmur32v3` oracle — exact match.
  - OpenFeature provider keeps `@openfeature/server-sdk` type-only (its reasons/errorCodes are runtime enums) → zero runtime deps in the request path. Last-known-good + stale verified by swapping in a throwing storage stub mid-run.
- **Decisions:** server inlines anonymous auth + allow-all authz defaults (no coupling to auth/none impls); publish writes snapshot to BOTH source & runtime stores so rollback works against runtime.
- **Next:** P7 bundled UI (React+Vite+Tailwind → dist/ui), then standalone+Docker, CLI, docs, CI.

## 2026-06-29 — P0 Bootstrap (done)

- **Task:** Read spec + ChatGPT brief; study `@xtandard/lib` (`/Users/santi/Projects/xantiagoma`) conventions; scaffold repo.
- **Discoveries:**
  - Reference uses `vite-plus` (`vp pack`/`vp test`/`vp lint`/`vp fmt`), flat `entry-*.ts` files → `dist/entry-*.{mjs,cjs,d.mts,d.cts}`, optional peer deps, `changelogen` releases, `husky`.
  - tsconfig: ESNext / `module: Preserve` / `moduleResolution: bundler` / `verbatimModuleSyntax` / strict / `noUncheckedIndexedAccess`.
  - `vp` CLI not installed globally; runs via local `vite-plus` devDep.
  - Bun 1.3.14, Node 22.15 available.
- **Decision:** flat `entry-*.ts` re-export files (proven pattern) instead of nested pack entries — avoids `vp pack` nested-output naming ambiguity.
- **Decision:** evaluator + openfeature provider kept **zero-dep**; `valibot` used only in admin/compile path. See ADR 0002.
- **Decision:** React is a build-time devDep (bundled SPA), NOT a peer — `/react` component export is a v1 non-goal. See ADR 0003.
- **Files:** PLAN.md, WORKLOG.md, TODO.md (+ scaffold next).
- **Next:** write package.json/tsconfig/vite configs, install deps, verify `vp pack`/`vp test` on a trivial entry, then build P1 core.
