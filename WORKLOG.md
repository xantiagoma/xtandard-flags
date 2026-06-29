# WORKLOG — `@xtandard/flags`

Reverse-chronological. Each entry: timestamp · task · files · tests · blocker · next.

---

## 2026-06-29 — P1–P6 complete: headless library builds & passes (167 tests)

- **Task:** Build core, storage, OpenFeature provider, auth/authz, server/API, framework adapters. Fanned out 3 background subagents (storage, auth+authz, openfeature) against the stable contracts; built core+server+adapters myself.
- **Result:** `vp pack` builds the full exports map (27 entries × ESM/CJS/DTS = 75 files). `tsc --noEmit` clean. `vp test` → 167 passed, 5 skipped (Redis-live, run when `REDIS_URL` set). publint clean except `./ui/*` (UI not built yet).
- **Files:** src/{schema,keys,hash,evaluator,validation,snapshot,core,testing,index}.ts; src/storage/{contract,memory,file,unstorage,redis}.ts; src/auth/{contract,none,basic,delegated}.ts; src/authorization/{contract,none,roles,delegated}.ts; src/server/{base-path,routes,render-index-html,static-assets,create-fetch-handler}.ts; src/adapters/{bun,elysia,hono}.ts; all entry-*.ts; test/* (18 files).
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
