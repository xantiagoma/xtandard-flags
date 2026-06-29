# ADR 0001 — Single Package with Subpath Exports

**Status:** Accepted

---

## Context

`@xtandard/flags` ships a large surface: a core evaluator, a snapshot model, storage adapters (memory, file, Redis, unstorage), auth providers, authorization providers, framework adapters (Elysia, Hono, Bun), an OpenFeature provider, and test helpers. Many of these pull in optional peer dependencies (`redis`, `unstorage`, `elysia`, `hono`, `@openfeature/server-sdk`).

The alternatives were:

- **Multiple packages** — e.g. `@xtandard/flags-core`, `@xtandard/flags-redis`, `@xtandard/flags-elysia`. Each would be separately versioned and published.
- **One package, one entry point** — consumers import everything, tree-shaking handles the rest.
- **One package, explicit subpath exports** — each logical unit is a separate export condition in `package.json`.

The key constraints were:

- The evaluator and OpenFeature provider must have **zero runtime dependencies** in the request path.
- Optional peer dependencies (`redis`, `unstorage`, etc.) must not be pulled in unless the consumer explicitly installs and imports them.
- Consumers should install one package and choose what they wire up.

---

## Decision

Ship `@xtandard/flags` as a **single npm package with explicit subpath exports** mapping to thin `entry-*.ts` re-export entrypoints. Each subpath is built as an independent entry point by vite-plus (`vp pack`), producing dual ESM/CJS bundles with `.mjs`/`.cjs` and `.d.mts`/`.d.cts` declarations.

```
@xtandard/flags               ← core types, evaluator, snapshot, createFlagsCore, createFetchHandler
@xtandard/flags/openfeature   ← OpenFeature provider
@xtandard/flags/storage/redis ← Redis adapter (peers: redis)
@xtandard/flags/storage/file  ← File adapter
@xtandard/flags/storage/memory
@xtandard/flags/storage/unstorage ← (peers: unstorage)
@xtandard/flags/auth/none
@xtandard/flags/auth/basic
@xtandard/flags/auth/delegated
@xtandard/flags/authorization/none
@xtandard/flags/authorization/roles
@xtandard/flags/authorization/delegated
@xtandard/flags/elysia         ← (peers: elysia)
@xtandard/flags/hono           ← (peers: hono)
@xtandard/flags/bun
@xtandard/flags/testing
```

Optional peers are declared in `peerDependencies` with `peerDependenciesMeta.optional: true`. Each adapter that needs a peer does a dynamic `import()` at runtime and calls `requirePeer(name, subpath)` to throw a clear, actionable error when the peer is missing.

The build tool is vite-plus (`vp pack`), which matches the `@xtandard/lib` sibling package convention and produces the dual ESM/CJS+DTS output from flat `entry-*.ts` files.

---

## Consequences

- **One `bun add` / `npm install`** installs the whole package. Consumers add only the peers they actually use.
- **No cross-subpath leakage** — importing `@xtandard/flags/openfeature` does not bundle the Redis adapter.
- **Version coherence** — all parts of the system are always on the same version. No cross-package compatibility matrix.
- **Bigger publish artefact** than a minimal core package, but with clear tree-shaking boundaries per subpath.
- vite-plus dual output requires keeping `entry-*.ts` files in sync with `package.json` exports — a small maintenance cost.
