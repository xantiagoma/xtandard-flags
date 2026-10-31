import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The React embed inside a host app that owns its theme (class-based dark mode,
// no data-theme, its own global text color) — the dashboard must resolve to ONE
// theme: surfaces, text and dialogs all light or all dark. The host bundle is
// built by the webServer step (see playwright.config.ts → e2e/embed-host).

const HOST_DIR = new URL("./.embed-host/", import.meta.url);

/** The host page: class-based theming, with the host's own body colors. */
function hostHtml(htmlClass: string): string {
  return `<!doctype html><html class="${htmlClass}"><head><meta charset="utf-8">
<link rel="stylesheet" href="/__embed__/main.css">
<style>
  body { margin: 0; background: #ffffff; color: #111111; }
  html.dark body { background: #0b0b0f; color: #f5f5f5; }
</style></head>
<body><div id="root"></div><script type="module" src="/__embed__/main.js"></script></body></html>`;
}

async function openHost(page: Page, { htmlClass = "", theme = "inherit" } = {}): Promise<void> {
  await page.route("**/__embed__/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace("/__embed__/", "");
    if (path === "index.html") {
      return route.fulfill({ contentType: "text/html", body: hostHtml(htmlClass) });
    }
    const type = path.endsWith(".css") ? "text/css" : "text/javascript";
    return route.fulfill({ contentType: type, body: readFileSync(new URL(path, HOST_DIR)) });
  });
  await page.goto(`/__embed__/index.html?theme=${theme}`);
  await expect(page.getByRole("heading", { name: "Feature Flags" })).toBeVisible();
}

/** Relative luminance (0 = black, 1 = white) of an element's computed color property. */
function luminance(page: Page, selector: string, prop: "color" | "backgroundColor") {
  return page
    .locator(selector)
    .first()
    .evaluate((el, p) => {
      // Computed colors may be oklch(); paint to a canvas to get sRGB bytes.
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.fillStyle = getComputedStyle(el)[p];
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }, prop);
}

const WRAPPER = ".xtandard-flags";
const TITLE = `${WRAPPER} h1`;

async function expectDark(page: Page): Promise<void> {
  await expect(page.locator(WRAPPER)).toHaveAttribute("data-theme", "dark");
  expect(await luminance(page, WRAPPER, "backgroundColor")).toBeLessThan(0.25);
  expect(await luminance(page, TITLE, "color")).toBeGreaterThan(0.75);
}

async function expectLight(page: Page): Promise<void> {
  await expect(page.locator(WRAPPER)).toHaveAttribute("data-theme", "light");
  expect(await luminance(page, WRAPPER, "backgroundColor")).toBeGreaterThan(0.75);
  expect(await luminance(page, TITLE, "color")).toBeLessThan(0.25);
}

test.describe("embed theme", () => {
  test('theme="inherit" follows a class-based dark host even when the OS is light', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openHost(page, { htmlClass: "dark" });
    await expectDark(page);
    // The host owns the theme: no in-panel switcher, and the host <html> is untouched.
    await expect(page.getByRole("group", { name: "Theme" })).toHaveCount(0);
    expect(await page.locator("html").getAttribute("data-theme")).toBeNull();

    // Dialogs (portaled into the wrapper) resolve to the same theme.
    await page.getByRole("button", { name: "New flag" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await luminance(page, '[role="dialog"]', "backgroundColor")).toBeLessThan(0.25);
    await page.screenshot({ path: "test-results/embed-inherit-dark.png" });
  });

  test('theme="inherit" switches live when the host toggles its class', async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openHost(page, { htmlClass: "dark" });
    await expectDark(page);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await expectLight(page);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expectDark(page);
  });

  test('theme="inherit" falls back to prefers-color-scheme when the host sets nothing', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openHost(page);
    await expectDark(page);
    await page.emulateMedia({ colorScheme: "light" });
    await expectLight(page);
  });

  test('theme="auto" keeps its own switcher and themes only its wrapper', async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openHost(page, { theme: "auto" });
    await expectLight(page);
    await page.getByRole("button", { name: "Dark theme" }).click();
    await expectDark(page);
    expect(await page.locator("html").getAttribute("data-theme")).toBeNull();
    // Reset the persisted preference for other tests sharing this origin.
    await page.getByRole("button", { name: "System theme" }).click();
  });

  test('theme="dark" is fixed regardless of host and OS', async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openHost(page, { theme: "dark" });
    await expectDark(page);
    await expect(page.getByRole("group", { name: "Theme" })).toHaveCount(0);
  });
});
