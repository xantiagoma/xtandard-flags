import React, { createContext, useContext, useSyncExternalStore } from "react";
import {
  detectHostTheme,
  getThemePref,
  resolveTheme,
  subscribeHostTheme,
  subscribeThemePref,
  type ResolvedTheme,
} from "../theme.ts";

/**
 * How the dashboard's theme is decided:
 * - `"auto"` — its own system/light/dark preference (persisted), with the toggle.
 * - `"inherit"` — follow the host page (see {@link detectHostTheme}); no toggle.
 * - `"light"` / `"dark"` — fixed by the host (e.g. from its own theme state); no toggle.
 */
export type ThemeMode = "auto" | "inherit" | ResolvedTheme;

interface ThemeState {
  /** The single theme every surface, text color and viewer resolves to. */
  resolved: ResolvedTheme;
  /** Whether the dashboard owns the theme (shows its own toggle). */
  showToggle: boolean;
}

const ThemeContext = createContext<ThemeState | null>(null);

const resolvePref = () => resolveTheme(getThemePref());
const serverLight = (): ResolvedTheme => "light";

/** Resolve a {@link ThemeMode} to a concrete theme, re-rendering on every relevant change. */
export function useResolvedTheme(mode: ThemeMode): ResolvedTheme {
  // Both stores are always subscribed (hooks can't be conditional); only the one
  // matching `mode` is read.
  const fromPref = useSyncExternalStore(subscribeThemePref, resolvePref, serverLight);
  const fromHost = useSyncExternalStore(subscribeHostTheme, detectHostTheme, serverLight);
  if (mode === "auto") return fromPref;
  if (mode === "inherit") return fromHost;
  return mode;
}

export function ThemeProvider({
  mode,
  children,
}: {
  mode: ThemeMode;
  children: (resolved: ResolvedTheme) => React.ReactNode;
}): React.ReactElement {
  const resolved = useResolvedTheme(mode);
  return (
    <ThemeContext.Provider value={{ resolved, showToggle: mode === "auto" }}>
      {children(resolved)}
    </ThemeContext.Provider>
  );
}

/** The active theme. Outside a provider (the standalone SPA) it's the persisted preference. */
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  const fromPref = useSyncExternalStore(subscribeThemePref, resolvePref, serverLight);
  return ctx ?? { resolved: fromPref, showToggle: true };
}
