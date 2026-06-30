# ADR 0005 — UI Routing (pluggable, hash by default for the embed)

**Status:** Accepted

---

## Context

The dashboard ships in two modes (see [ADR 0003](./0003-bundled-spa-ui.md)):

1. **Bundled SPA** — served by the panel handler (standalone app or a framework adapter mounted at a `basePath`). The handler already serves `index.html` as a **catch-all** for any non-API, non-asset path.
2. **`@xtandard/flags/react` `<FlagsDashboard>`** — embedded as a component _inside_ a host React app (Next.js, React Router, …), mounted at some host route.

Originally the UI kept the current view (Flags/Segments/Snapshots/Audit), the selected flag/segment, and the project/environment in React state — no URL involvement. That's maximally non-interfering but loses deep links, the browser back button, and refresh-stays-put.

Adding routing has a hard constraint: in the **embed** case the host app owns `location.pathname` and its history. If the panel wrote to the pathname it would fight the host router and 404 on refresh (the host server has no catch-all for our sub-routes).

## Decision

Routing is **pluggable** via a wouter location hook, with per-mode defaults:

- **Bundled SPA → browser-history routing** (`wouter/use-browser-location`), based at the injected `basePath`. Clean, deep-linkable paths (`/flags/my-flag`, `/segments`), and refresh works because the handler's SPA catch-all serves `index.html` under the base.
- **Embed `<FlagsDashboard>` → hash routing by default** (`wouter/use-hash-location`). Routes live in `location.hash`, so we never touch the host's pathname or history — it works mounted anywhere with zero server config. Overridable via the `routing` prop: `"hash"` (default) | `"browser"` (host must catch-all under `routerBase`) | `"memory"` (no URL coupling) | a custom wouter hook.

Project/environment live in the URL **query** (`?project=&env=`) so a shared link restores full context; tab/flag navigation preserves it. wouter (`useSearchParams`) reads/writes the query consistently across hash and browser modes.

Routes: `/` (+ `/flags`) list, `/flags/:key` detail (`/flags/new` = create), `/segments` (+`/segments/:key`), `/snapshots`, `/audit`. The create-flow seed (key + type) is the one piece of non-URL state (it's transient, pre-save), held in component state.

**Library:** wouter (~2kb) — purpose-built for pluggable location hooks (browser/hash/memory), with a tiny `<Route>`/`<Switch>` matcher that fits the small route space.

## Consequences

- **Deep links + back/forward** in both modes; refresh stays on the current view/flag.
- **Zero host interference for the embed** — hash routing is invisible to pathname-based host routers; `"memory"` opts out of the URL entirely.
- **`routing: "browser"` for the embed carries a requirement** — the host must serve the panel's `index.html` as a catch-all under `routerBase`, or refresh 404s. Documented on the prop; hash avoids it.
- **One small piece of non-routed state** (the create seed) — acceptable; deep-linking to `/flags/new` without it just starts a blank boolean flag.
