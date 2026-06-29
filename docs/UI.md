# UI

The admin UI is a bundled single-page application (SPA). It is built with React, Vite, and Tailwind v4, compiled to `dist/ui`, and served by the panel handler. Consumers who mount the panel do not install or import React — it is a build-time dependency of the UI package only, never a peer dependency of `@xtandard/flags`.

---

## Bundled SPA Model

The panel handler serves the admin UI from the `dist/ui` directory at build time. The SPA is a static bundle:

```
dist/ui/
  index.html        ← entry point; receives <base> and bootstrap config at serve time
  assets/           ← hashed JS/CSS chunks
```

The handler injects two things into `index.html` before serving it:

1. `<base href="/{basePath}/">` — resolves all relative asset URLs under the mount path.
2. `<script>window.__FLAGS_CONFIG__ = { title, basePath, readonly, defaultProjectKey, defaultEnvironmentKey }</script>` — bootstrap config read by the SPA on startup.

The `/config` API endpoint returns the same object for dynamic runtime use.

---

## Served Routes

The panel handler (`createFetchHandler`) dispatches in this order:

1. **JSON API** — paths matching `/api/*` or `/config`.
2. **Static assets** — paths ending in a file extension that exist under `dist/ui`.
3. **404** — a path that looks like a static asset (`/assets/main.abc123.js`) but is not found.
4. **SPA fallback** — everything else (including `/`, `/flags/my-flag`, etc.) returns the injected `index.html`.

This means the SPA can use client-side routing freely — any unknown path falls through to `index.html` and React Router (or equivalent) handles it.

---

## Building the UI

```bash
bun run build:ui
# Runs: vite build --config vite.ui.config.ts
# Output: dist/ui/
```

During development:

```bash
bun run dev:ui
# Runs: vite --config vite.ui.config.ts
# Starts Vite dev server for the UI only (not the panel API)
```

The full build (library + UI):

```bash
bun run build
# Runs: bun run build:lib && bun run build:ui
```

---

## `basePath` and `window.__FLAGS_CONFIG__`

When you mount the panel at a non-root path (e.g., `/flags`), set `basePath: "/flags"` in `FlagsPanelOptions`. The handler:

1. Prepends `<base href="/flags/">` to `index.html`.
2. Injects `window.__FLAGS_CONFIG__.basePath = "/flags"`.

The SPA reads `window.__FLAGS_CONFIG__` on startup so it can construct correct API URLs and router base paths relative to the mount point.

---

## No React Peer for Consumers

Mounting the panel does not require React in your project. The SPA is pre-built into `dist/ui`. The handler serves static files — it has no React dependency.

React is only a dev dependency used to build the UI bundle. If you are building the package from source, `react` and `react-dom` are in `devDependencies`.

---

## Custom UI Directory

The default `uiDir` is resolved relative to the package installation path (`./ui` beside the built module). You can override it for Docker image path adjustments or to serve a custom-built UI:

```ts
import { createFetchHandler } from "@xtandard/flags";

const { fetch, core } = createFetchHandler({
  sourceStorage,
  uiDir: "/app/dist/ui", // absolute path inside the container
});
```

The standalone app reads `UI_DIR` from the environment for the same purpose.

---

## Fallback Page

If the `dist/ui` directory is absent (e.g., the library was installed but `bun run build:ui` has not run), the handler serves a minimal fallback HTML page that:

- Displays the configured `title`.
- Notes that the UI bundle is not built and instructs you to run `bun run build:ui`.
- Makes clear that the JSON API at `api/` is fully available.

This lets the API and CLI work without the UI being built.

## Advanced: embed as a React component (`@xtandard/flags/react`)

Most consumers mount the bundled SPA via a framework adapter and never install
React. For teams that want the dashboard inside an existing React app:

```tsx
import { FlagsDashboard } from "@xtandard/flags/react";
import "@xtandard/flags/react/styles.css";

// Point it at wherever the panel API (+ /config) is mounted:
export default function FlagsPage() {
  return <FlagsDashboard apiBaseUrl="/flags" />;
}
```

`react` and `react-dom` are (optional) peer dependencies in this mode; TanStack
Query and styles are bundled. The component ships as `dist/react.js` + a single
`dist/react.css`. See [`examples/react-embed`](../examples/react-embed) for a
working host app (Vite dev proxy → standalone panel). The system/light/dark
switcher is included; pass `theme="inherit"` to manage the theme yourself.
