/**
 * Host-theme detection for the React embed's `theme="inherit"`: the host's
 * explicit signal (class / data attribute / inline color-scheme on <html>, then
 * <body>) wins over the OS preference.
 *
 * @module
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { detectHostTheme, type ThemeSignalSource } from "../src/ui/theme.ts";

function el({
  classes = [],
  attrs = {},
  colorScheme,
}: {
  classes?: string[];
  attrs?: Record<string, string>;
  colorScheme?: string;
} = {}): ThemeSignalSource {
  return {
    classList: { contains: (t) => classes.includes(t) },
    getAttribute: (n) => attrs[n] ?? null,
    style: { colorScheme },
  };
}

function osPrefers(dark: boolean): void {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: dark && q.includes("dark"),
    addEventListener() {},
    removeEventListener() {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectHostTheme", () => {
  it("follows a `dark` class on <html> even when the OS prefers light", () => {
    osPrefers(false);
    expect(detectHostTheme(el({ classes: ["dark"] }), el())).toBe("dark");
  });

  it("follows a `light` class on <html> even when the OS prefers dark", () => {
    osPrefers(true);
    expect(detectHostTheme(el({ classes: ["light"] }), el())).toBe("light");
  });

  it("reads data-theme / data-mode / data-color-scheme", () => {
    osPrefers(false);
    expect(detectHostTheme(el({ attrs: { "data-theme": "dark" } }), el())).toBe("dark");
    expect(detectHostTheme(el({ attrs: { "data-mode": "dark" } }), el())).toBe("dark");
    expect(detectHostTheme(el({ attrs: { "data-color-scheme": "dark" } }), el())).toBe("dark");
  });

  it("reads an inline color-scheme", () => {
    osPrefers(false);
    expect(detectHostTheme(el({ colorScheme: "dark" }), el())).toBe("dark");
  });

  it("falls back to <body>, and <html> wins over <body>", () => {
    osPrefers(false);
    expect(detectHostTheme(el(), el({ classes: ["dark"] }))).toBe("dark");
    expect(detectHostTheme(el({ classes: ["light"] }), el({ classes: ["dark"] }))).toBe("light");
  });

  it("uses the OS preference only when the host sets no signal", () => {
    osPrefers(true);
    expect(detectHostTheme(el(), el())).toBe("dark");
    osPrefers(false);
    expect(detectHostTheme(el(), el())).toBe("light");
  });

  it("ignores unrelated data-theme values", () => {
    osPrefers(true);
    expect(detectHostTheme(el({ attrs: { "data-theme": "ocean" } }), el())).toBe("dark");
  });
});
