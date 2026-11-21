/**
 * Theme preference: `system` (follows the OS), `light`, or `dark`, persisted in
 * localStorage under `xtandard-flags:theme` (the store is `@xtandard/kit/ui`'s
 * `createThemeStore`). `system` live-updates when the OS scheme changes. The
 * standalone SPA writes the resolved value to `<html data-theme>`; the React
 * embed writes it to its own wrapper instead, so it never touches the host
 * document.
 */

import { createThemeStore } from "@xtandard/kit/ui";

export {
  detectHostTheme,
  resolveTheme,
  subscribeHostTheme,
  type ResolvedTheme,
  type ThemePref,
  type ThemeSignalSource,
} from "@xtandard/kit/ui";

/** The flags theme store (the key every earlier release used). */
export const themeStore = createThemeStore("xtandard-flags:theme");

export const { getThemePref, setThemePref, subscribeThemePref, initTheme } = themeStore;
