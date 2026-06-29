import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { looksLikeAsset, serveStaticAsset } from "../src/server/static-assets.ts";
import { renderIndexHtml } from "../src/server/render-index-html.ts";

let uiDir: string;
let emptyDir: string;

beforeEach(async () => {
  uiDir = await mkdtemp(join(tmpdir(), "flags-ui-"));
  emptyDir = await mkdtemp(join(tmpdir(), "flags-empty-"));
  await writeFile(
    join(uiDir, "index.html"),
    "<html><head><title>UI</title></head><body><div id=root></div></body></html>",
    "utf8",
  );
  await mkdir(join(uiDir, "assets"), { recursive: true });
  await writeFile(join(uiDir, "assets", "app.js"), "console.log('hi')", "utf8");
});

afterEach(async () => {
  await rm(uiDir, { recursive: true, force: true });
  await rm(emptyDir, { recursive: true, force: true });
});

const panel = (dir: string, opts: Record<string, unknown> = {}) =>
  createFetchHandler({ sourceStorage: createMemoryStorage(), uiDir: dir, ...opts });

const get = (path: string) => new Request(`http://localhost${path}`, { method: "GET" });

describe("static assets via fetch handler", () => {
  test("serves an asset with content-type and immutable cache-control", async () => {
    const { fetch } = panel(uiDir);
    const res = await fetch(get("/assets/app.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(await res.text()).toContain("hi");
  });

  test("serves index.html for / with no-cache (not immutable)", async () => {
    const { fetch } = panel(uiDir);
    const res = await fetch(get("/index.html"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("SPA fallback injects <base> and __FLAGS_CONFIG__ from real index.html", async () => {
    const { fetch } = panel(uiDir, { basePath: "/flags", title: "My UI" });
    const res = await fetch(get("/flags/some/spa/route"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<base href="/flags/">');
    expect(html).toContain("__FLAGS_CONFIG__");
    expect(html).toContain("<title>UI</title>");
  });

  test("missing asset with an extension → 404 (not SPA)", async () => {
    const { fetch } = panel(uiDir);
    const res = await fetch(get("/assets/missing.css"));
    expect(res.status).toBe(404);
  });

  test("fallback page when index.html is absent", async () => {
    const { fetch } = panel(emptyDir, { title: "Fallback Title" });
    const res = await fetch(get("/whatever"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Fallback Title");
    expect(html).toContain("bun run build:ui");
    expect(html).toContain("__FLAGS_CONFIG__");
  });
});

describe("serveStaticAsset directly", () => {
  test("path traversal is refused (returns null)", async () => {
    const res = await serveStaticAsset(uiDir, "/../../etc/passwd");
    expect(res).toBeNull();
  });

  test("returns null for a non-existent file", async () => {
    expect(await serveStaticAsset(uiDir, "/nope.js")).toBeNull();
  });

  test("unknown extension falls back to octet-stream", async () => {
    await writeFile(join(uiDir, "data.bin"), "x", "utf8");
    const res = await serveStaticAsset(uiDir, "/data.bin");
    expect(res?.headers.get("content-type")).toBe("application/octet-stream");
  });
});

describe("renderIndexHtml", () => {
  const cfg = {
    title: "T",
    basePath: "",
    readonly: false,
    defaultProjectKey: "default",
    defaultEnvironmentKey: "production",
  };

  test("prepends tags when index.html has no <head>", async () => {
    await writeFile(join(uiDir, "index.html"), "<div id=root></div>", "utf8");
    const html = await renderIndexHtml(uiDir, cfg);
    expect(html.startsWith('<base href="/">')).toBe(true);
    expect(html).toContain("__FLAGS_CONFIG__");
    expect(html).toContain("<div id=root></div>");
  });

  test("escapes < and > in the injected config to prevent script breakout", async () => {
    await writeFile(join(uiDir, "index.html"), "<head></head>", "utf8");
    const html = await renderIndexHtml(uiDir, { ...cfg, title: "</script><x>" });
    expect(html).not.toContain("</script><x>");
    expect(html).toContain("\\u003c");
  });

  test("falls back to the built-in page when index.html is missing", async () => {
    const html = await renderIndexHtml(emptyDir, { ...cfg, title: "Built-in" });
    expect(html).toContain("Built-in");
    expect(html).toContain("bun run build:ui");
  });
});

describe("looksLikeAsset", () => {
  test("true for paths whose last segment has a dot", () => {
    expect(looksLikeAsset("/assets/app.js")).toBe(true);
    expect(looksLikeAsset("/favicon.ico")).toBe(true);
  });
  test("false for extensionless paths", () => {
    expect(looksLikeAsset("/some/route")).toBe(false);
    expect(looksLikeAsset("/")).toBe(false);
  });
});
