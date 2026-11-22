/**
 * `@xtandard/flags/react` — embed the admin dashboard as a React component in
 * your own app (advanced mode). Most users mount the bundled SPA via a framework
 * adapter and never touch React; this is for teams that want the panel inside an
 * existing React shell.
 *
 * ```tsx
 * import { FlagsDashboard } from "@xtandard/flags/react";
 * import "@xtandard/flags/react/styles.css";
 *
 * // Point it at wherever the panel API is mounted:
 * <FlagsDashboard apiBaseUrl="/flags" />
 * ```
 *
 * `react` and `react-dom` are peer dependencies in this mode. The component is
 * self-contained otherwise (TanStack Query and styles are bundled).
 *
 * @module react
 */

import type React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createEmbed, type EmbedBaseProps, type EmbedRouting } from "@xtandard/kit/ui/embed";
import type { FetchLike, ThemeMode } from "@xtandard/kit/ui";
import { App } from "./ui/App.tsx";
import * as api from "./ui/api.ts";
import { themeStore } from "./ui/theme.ts";
import "./ui/styles.css";

/** Props for {@link FlagsDashboard}. */
export interface FlagsDashboardProps extends EmbedBaseProps {
  /**
   * Base URL where the panel API + `/config` are mounted (e.g. `"/flags"` or
   * `"https://admin.example.com/flags"`). Defaults to `""` (same origin, relative).
   */
  apiBaseUrl?: string;
  /**
   * `credentials` mode for API requests. Defaults to `"same-origin"`. For a
   * **cross-origin** embed (panel served from a different origin than this app)
   * with cookie-based auth, set `"include"` — and enable `cors` on the panel
   * server so it returns `Access-Control-Allow-Credentials`.
   */
  credentials?: RequestCredentials;
  /**
   * Custom `fetch` for API requests — inject a bearer token / extra headers, or
   * instrument calls. Defaults to the global `fetch`.
   */
  fetch?: FetchLike;
  /** Bring your own QueryClient; one is created if omitted. */
  queryClient?: QueryClient;
  /**
   * How the dashboard is themed. Whatever the mode, the whole dashboard (surfaces,
   * text, borders, dialogs, code/diff viewers) resolves to one theme, applied as
   * `data-theme` on its own wrapper — the host document is never modified.
   * - `"auto"` (default) — the dashboard's own system/light/dark switcher
   *   (persisted in localStorage).
   * - `"inherit"` — follow the host page live: a `dark`/`light` class or a
   *   `data-theme` (also `data-mode`/`data-color-scheme`) attribute or inline
   *   `color-scheme` on `<html>`, then `<body>`; the OS `prefers-color-scheme`
   *   only when the host sets none. The switcher is hidden — the host owns it.
   * - `"light"` / `"dark"` — fixed; pass your app's resolved theme to control it
   *   directly. The switcher is hidden.
   */
  theme?: ThemeMode;
  /** Extra className on the dashboard root wrapper. */
  className?: string;
  /**
   * How the dashboard routes between views/flags.
   * - `"hash"` (default) — routes in `location.hash`; never touches the host app's
   *   router or pathname. Safest when mounted inside another app.
   * - `"browser"` — real history paths (clean URLs). Requires the host to serve the
   *   panel's `index.html` as a catch-all under `routerBase`, else refresh 404s.
   * - `"memory"` — in-memory only; no URL coupling at all.
   * - a custom wouter location hook for full control.
   */
  routing?: EmbedRouting;
  /** Base path the panel is mounted at, used by `routing: "browser"` (e.g. `"/admin/flags"`). */
  routerBase?: string;
  /** Navbar logo image URL (replaces the title wordmark). Overrides server `/config`. */
  logoUrl?: string;
  /**
   * Pre-select a project on first render, overriding the server's configured
   * default — e.g. an admin panel embedding one dashboard per tenant. The URL
   * still wins when it names one (`?project=`), so deep links and the in-app
   * switcher behave normally afterwards.
   */
  initialProjectKey?: string;
  /** Pre-select an environment on first render (see {@link initialProjectKey}). */
  initialEnvironmentKey?: string;
}

/**
 * The shared embed plumbing (`@xtandard/kit/ui/embed`): one theme per embed on
 * the `.xtandard-flags` wrapper, toasts and Base UI portals inside it, and the
 * memory router keeping its query string.
 */
const embed = createEmbed<{ initialProjectKey?: string; initialEnvironmentKey?: string }>({
  App,
  scopeClass: "xtandard-flags",
  api,
  themeKey: themeStore,
  displayNames: { dashboard: "FlagsDashboard" },
});

/** The full feature-flag admin dashboard as an embeddable React component. */
export const FlagsDashboard: React.FC<FlagsDashboardProps> = embed.Dashboard;

export { setApiBase } from "./ui/api.ts";
export { setThemePref, getThemePref, type ThemePref, type ResolvedTheme } from "./ui/theme.ts";
export type { FetchLike, ThemeMode };
export default FlagsDashboard;
