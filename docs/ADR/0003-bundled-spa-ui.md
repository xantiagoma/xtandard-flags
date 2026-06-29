# ADR 0003 — Bundled SPA UI

**Status:** Accepted

---

## Context

The admin panel needs a web UI. Options considered:

1. **Server-rendered HTML** (e.g. HTMX, plain HTML templates) — simpler deployment, but significantly more complex to build a rich flag editor with live validation, split configuration, rule builder, and publish flow.
2. **React component library exported as a peer** — consumers install React and mount `<FlagsPanel />` in their own app. Clean integration but adds React as a peer dependency for every consumer.
3. **Bundled SPA served from the package** — React is used to build the UI, the output is compiled to `dist/ui`, and the panel handler serves the static bundle. Consumers never install React.

The key constraint was: **consumers who mount the panel must not be required to install React or any frontend framework.**

---

## Decision

Build the admin UI as a **bundled SPA** using React, Vite, and Tailwind v4, with the output committed/published to `dist/ui/` inside the package. The panel handler (`createFetchHandler`) serves the static bundle from disk, injecting a `<base>` tag and a `window.__FLAGS_CONFIG__` bootstrap object into `index.html` at serve time.

React is a `devDependency` of `@xtandard/flags`. It is not in `peerDependencies` and not re-exported. The `dist/ui` directory contains pre-compiled, self-contained HTML/JS/CSS that requires no runtime React import from consumers.

The UI build command is separate (`bun run build:ui` / `vite build --config vite.ui.config.ts`) from the library build (`bun run build:lib` / `vp pack`) so the two can evolve independently.

### Bootstrap and basePath

The SPA reads `window.__FLAGS_CONFIG__` (injected by `renderIndexHtml`) for:

- `basePath` — so all client-side routes and API calls use the correct prefix.
- `title`, `readonly`, `defaultProjectKey`, `defaultEnvironmentKey` — UI-level configuration.

The `<base href="/{basePath}/">` tag ensures relative asset URLs in the compiled bundle resolve correctly under any mount path without requiring the SPA to know its own path at build time.

### Fallback Page

When `dist/ui` is absent (common when running from source before building), the handler returns a minimal HTML page explaining that `bun run build:ui` needs to run. The JSON API remains fully operational in this state.

---

## Consequences

- **No React peer for consumers** — the largest win. Mounting the panel is purely a server-side operation.
- **Bigger package size** — `dist/ui` adds the compiled SPA to the published artefact. Mitigated by the `files` field in `package.json` (only `dist`, `bin`, `docs`, `LICENSE`, `README.md` are included).
- **Build step required before serving** — the UI must be built (`bun run build:ui`) before the admin panel shows anything beyond the fallback page. This is documented and handled by the Docker image build.
- **No `<FlagsPanel />` React component in v1** — an embeddable React component for mounting the UI inside an existing React app is a non-goal for v1. The bundled SPA covers the primary use cases (embedded in a sub-path, standalone Docker). A future `/react` subpath export may expose this, but it would introduce React as a peer dependency for that specific subpath only.
- **Workbench-style deployment** — the SPA is a self-contained tool, not a component library, which keeps the architecture simple and the consumer API clean.
