# WORKLOG — `@xtandard/flags`

Reverse-chronological. Each entry: timestamp · task · files · tests · blocker · next.

---

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
