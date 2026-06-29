import { describe, expect, test } from "vitest";
import { flagsPanel as bunPanel } from "../src/adapters/bun.ts";
import { flagsPanel as elysiaPanel } from "../src/adapters/elysia.ts";
import { flagsPanel as honoPanel } from "../src/adapters/hono.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";

describe("bun adapter", () => {
  test("returns a fetch handler and core", async () => {
    const panel = bunPanel({ sourceStorage: createMemoryStorage() });
    expect(typeof panel.fetch).toBe("function");
    expect(panel.core).toBeDefined();
    const res = await panel.fetch(new Request("http://x/config"));
    expect(res.status).toBe(200);
  });
});

describe("elysia adapter", () => {
  test("returns a request->response function with core attached", async () => {
    const handler = elysiaPanel({ sourceStorage: createMemoryStorage(), basePath: "/flags" });
    expect(typeof handler).toBe("function");
    expect(handler.core).toBeDefined();
    const res = await handler(new Request("http://x/flags/config"));
    expect((await res.json()).basePath).toBe("/flags");
  });
});

describe("hono adapter", () => {
  test("mounts under a route prefix", async () => {
    const { Hono } = await import("hono");
    const app = new Hono();
    app.route("/flags", honoPanel({ sourceStorage: createMemoryStorage(), basePath: "/flags" }));
    const res = await app.request("/flags/config");
    expect(res.status).toBe(200);
    expect((await res.json()).basePath).toBe("/flags");
  });

  test("serves the JSON API through hono", async () => {
    const { Hono } = await import("hono");
    const app = new Hono();
    app.route("/flags", honoPanel({ sourceStorage: createMemoryStorage(), basePath: "/flags" }));
    const create = await app.request("/flags/api/projects/default/environments/production/flags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "f1",
        type: "boolean",
        enabled: true,
        defaultVariant: "off",
        variants: { on: { value: true }, off: { value: false } },
        fallthrough: { variant: "off" },
      }),
    });
    expect(create.status).toBe(201);
  });
});
