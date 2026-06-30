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
 * @module
 */

import React from "react";
import type { BaseLocationHook } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useBrowserLocation } from "wouter/use-browser-location";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./ui/App.tsx";
import { ToastProvider } from "./ui/components/Toast.tsx";
import { setApiBase } from "./ui/api.ts";
import { initTheme } from "./ui/theme.ts";
import "./ui/styles.css";

/** Props for {@link FlagsDashboard}. */
export interface FlagsDashboardProps {
  /**
   * Base URL where the panel API + `/config` are mounted (e.g. `"/flags"` or
   * `"https://admin.example.com/flags"`). Defaults to `""` (same origin, relative).
   */
  apiBaseUrl?: string;
  /** Bring your own QueryClient; one is created if omitted. */
  queryClient?: QueryClient;
  /** Control theme handling. `"auto"` (default) initializes the system/light/dark switcher. */
  theme?: "auto" | "inherit";
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
  routing?: "hash" | "browser" | "memory" | BaseLocationHook;
  /** Base path the panel is mounted at, used by `routing: "browser"` (e.g. `"/admin/flags"`). */
  routerBase?: string;
  /** Navbar logo image URL (replaces the default icon + wordmark). Overrides server `/config`. */
  logoUrl?: string;
  /** Hide the default navbar icon (ignored when `logoUrl` is set). Overrides server `/config`. */
  hideIcon?: boolean;
}

let fallbackClient: QueryClient | undefined;
function getClient(): QueryClient {
  fallbackClient ??= new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  });
  return fallbackClient;
}

/** The full feature-flag admin dashboard as an embeddable React component. */
export function FlagsDashboard({
  apiBaseUrl = "",
  queryClient,
  theme = "auto",
  className,
  routing = "hash",
  routerBase = "",
  logoUrl,
  hideIcon,
}: FlagsDashboardProps): React.ReactElement {
  // Set the API base synchronously so child queries (run on mount) use it.
  setApiBase(apiBaseUrl);

  React.useEffect(() => {
    if (theme === "auto") initTheme();
  }, [theme]);

  const client = queryClient ?? getClient();

  // Resolve the routing strategy to a wouter location hook (+ base). The memory
  // hook is created once so its in-memory history survives re-renders.
  const memoryHook = React.useMemo(() => memoryLocation().hook, []);
  const { hook, base } = React.useMemo(() => {
    if (typeof routing === "function") return { hook: routing, base: routerBase };
    if (routing === "browser") return { hook: useBrowserLocation, base: routerBase };
    if (routing === "memory") return { hook: memoryHook, base: "" };
    return { hook: useHashLocation, base: "" };
  }, [routing, routerBase, memoryHook]);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <div className={className ? `xtandard-flags ${className}` : "xtandard-flags"}>
          <App locationHook={hook} base={base} logoUrl={logoUrl} hideIcon={hideIcon} />
        </div>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export { setApiBase } from "./ui/api.ts";
export { setThemePref, getThemePref, type ThemePref } from "./ui/theme.ts";
export default FlagsDashboard;
