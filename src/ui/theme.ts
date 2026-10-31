/**
 * Theme preference: `system` (follows the OS), `light`, or `dark`. The preference
 * is persisted in localStorage; `system` live-updates when the OS scheme changes.
 * The standalone SPA writes the resolved value to `<html data-theme>` (see
 * {@link initTheme}); the React embed writes it to its own wrapper instead, so it
 * never touches the host document.
 */
export type ThemePref = "system" | "light" | "dark";

/** A concrete theme — what every surface, text color and viewer resolves to. */
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "xtandard-flags:theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const prefListeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function prefersDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia(DARK_QUERY).matches;
}

/** The concrete theme a preference resolves to right now. */
export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === "system" ? (prefersDark() ? "dark" : "light") : pref;
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  for (const cb of prefListeners) cb();
}

/**
 * Subscribe to changes of the resolved preference theme — an explicit
 * {@link setThemePref} or, under `system`, the OS scheme flipping. Returns the
 * unsubscribe function (`useSyncExternalStore`-compatible).
 */
export function subscribeThemePref(cb: () => void): () => void {
  prefListeners.add(cb);
  const mq = typeof matchMedia !== "undefined" ? matchMedia(DARK_QUERY) : undefined;
  const onOs = () => {
    if (getThemePref() === "system") cb();
  };
  mq?.addEventListener("change", onOs);
  return () => {
    prefListeners.delete(cb);
    mq?.removeEventListener("change", onOs);
  };
}

/** The bits of an element {@link detectHostTheme} reads (keeps it testable without a DOM). */
export interface ThemeSignalSource {
  classList: { contains(token: string): boolean };
  getAttribute(name: string): string | null;
  style?: { colorScheme?: string };
}

function explicitTheme(el: ThemeSignalSource | null | undefined): ResolvedTheme | undefined {
  if (!el) return undefined;
  // Class strategy (Tailwind `darkMode: "class"`, next-themes `attribute="class"`, …).
  if (el.classList.contains("dark")) return "dark";
  if (el.classList.contains("light")) return "light";
  // Attribute strategy (`data-theme`, also `data-mode` / `data-color-scheme`).
  for (const attr of ["data-theme", "data-mode", "data-color-scheme"]) {
    const v = el.getAttribute(attr);
    if (v === "dark" || v === "light") return v;
  }
  // An inline `color-scheme: dark` (next-themes sets it alongside the class).
  const cs = el.style?.colorScheme?.trim();
  if (cs === "dark" || cs === "light") return cs;
  return undefined;
}

/**
 * The host page's theme, for `theme="inherit"`: an explicit signal on `<html>`
 * (then `<body>`) — a `dark`/`light` class, a `data-theme`/`data-mode`/
 * `data-color-scheme` attribute, or an inline `color-scheme` — and, only when
 * the host sets none, the OS `prefers-color-scheme`.
 */
export function detectHostTheme(
  root: ThemeSignalSource | null | undefined = typeof document !== "undefined"
    ? document.documentElement
    : undefined,
  body: ThemeSignalSource | null | undefined = typeof document !== "undefined"
    ? document.body
    : undefined,
): ResolvedTheme {
  return explicitTheme(root) ?? explicitTheme(body) ?? (prefersDark() ? "dark" : "light");
}

/**
 * Watch the host page for theme switches: class/attribute/style changes on
 * `<html>` and `<body>`, plus the OS scheme. Returns the unsubscribe function.
 */
export function subscribeHostTheme(cb: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(cb);
  const opts: MutationObserverInit = {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-mode", "data-color-scheme"],
  };
  observer.observe(document.documentElement, opts);
  if (document.body) observer.observe(document.body, opts);
  const mq = typeof matchMedia !== "undefined" ? matchMedia(DARK_QUERY) : undefined;
  mq?.addEventListener("change", cb);
  return () => {
    observer.disconnect();
    mq?.removeEventListener("change", cb);
  };
}

function apply(): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolveTheme(getThemePref());
  }
}

/**
 * Standalone SPA only: apply the stored preference to `<html data-theme>` and
 * keep it in sync (toggle + OS changes). Call once at boot. The React embed does
 * not call this — it themes its own wrapper.
 */
export function initTheme(): void {
  apply();
  subscribeThemePref(apply);
}
