import { describe, expect, test } from "vitest";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { getConfig, setApiBase, type FetchLike } from "../src/ui/api.ts";

const APP = "https://app.example.com";

const panel = (cors?: Parameters<typeof createFetchHandler>[0]["cors"]) =>
  createFetchHandler({ sourceStorage: createMemoryStorage(), cors });

const opts = (origin: string | null, method = "GET") =>
  new Request("http://localhost/api/config", {
    method,
    headers: origin ? { origin } : {},
  });

describe("server CORS (2b)", () => {
  test("preflight OPTIONS → 204 with allow-origin + credentials + methods", async () => {
    const { fetch } = panel({ origin: APP, credentials: true });
    const res = await fetch(
      new Request("http://localhost/api/projects/default/environments/production/flags", {
        method: "OPTIONS",
        headers: { origin: APP, "access-control-request-headers": "content-type" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type");
  });

  test("normal responses carry the CORS headers + Vary: Origin", async () => {
    const { fetch } = panel({ origin: APP, credentials: true });
    const res = await fetch(opts(APP));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("vary")?.toLowerCase()).toContain("origin");
  });

  test("a disallowed origin gets no CORS headers", async () => {
    const { fetch } = panel({ origin: APP });
    const res = await fetch(opts("https://evil.example.com"));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("list + predicate origins echo an allowed caller", async () => {
    const list = panel({ origin: [APP, "https://admin.example.com"] });
    expect((await list.fetch(opts(APP))).headers.get("access-control-allow-origin")).toBe(APP);

    const pred = panel({ origin: (o) => o.endsWith(".example.com") });
    expect(
      (await pred.fetch(opts("https://x.example.com"))).headers.get("access-control-allow-origin"),
    ).toBe("https://x.example.com");
  });

  test('"*" without credentials returns "*"; with credentials echoes the origin', async () => {
    const star = panel({ origin: "*" });
    expect((await star.fetch(opts(APP))).headers.get("access-control-allow-origin")).toBe("*");

    const starCreds = panel({ origin: "*", credentials: true });
    const res = await starCreds.fetch(opts(APP));
    expect(res.headers.get("access-control-allow-origin")).toBe(APP);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("no cors option → no CORS headers, OPTIONS not intercepted", async () => {
    const { fetch } = panel();
    const res = await fetch(opts(APP));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("client credentials/fetch (2a)", () => {
  test("setApiBase threads credentials + a custom fetch into requests", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch: FetchLike = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ title: "t", basePath: "" }), {
        headers: { "content-type": "application/json" },
      });
    };
    setApiBase("https://api.example.com/flags", { credentials: "include", fetch: fakeFetch });
    await getConfig();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.example.com/flags/config");
    expect(calls[0]?.init?.credentials).toBe("include");

    // Reset the module singletons so other suites are unaffected.
    setApiBase("", { credentials: "same-origin", fetch: (i, init) => fetch(i, init) });
  });
});
