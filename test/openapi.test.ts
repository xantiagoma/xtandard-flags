import { describe, expect, test } from "vitest";
import { buildOpenApiDocument } from "../src/server/openapi.ts";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";

const get = (path: string) => new Request(`http://localhost${path}`, { method: "GET" });

describe("buildOpenApiDocument", () => {
  test("produces an OpenAPI 3.1 document with the standard sections", () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi).toBe("3.1.0");
    const info = doc.info as { title: string; version: string };
    expect(info.title).toBe("Xtandard Flags Admin API");
    expect(info.version).toBe("0.1.0");
    expect(doc.servers).toEqual([{ url: "/" }]);
    expect(doc.paths).toBeDefined();
    expect(Object.keys(doc.paths as object).length).toBeGreaterThan(0);
  });

  test("honours basePath, title, and version options", () => {
    const doc = buildOpenApiDocument({ basePath: "/flags", title: "My API", version: "9.9.9" });
    expect(doc.servers).toEqual([{ url: "/flags" }]);
    expect((doc.info as { title: string }).title).toBe("My API");
    expect((doc.info as { version: string }).version).toBe("9.9.9");
  });

  test('a basePath of "/" collapses to the root server url', () => {
    const doc = buildOpenApiDocument({ basePath: "/" });
    expect(doc.servers).toEqual([{ url: "/" }]);
  });

  test("declares component schemas referenced by the paths", () => {
    const doc = buildOpenApiDocument();
    const components = doc.components as { schemas: Record<string, unknown> };
    expect(components.schemas).toBeDefined();
    expect(Object.keys(components.schemas).length).toBeGreaterThan(0);
  });
});

describe("openapi.json route", () => {
  const panel = () => createFetchHandler({ sourceStorage: createMemoryStorage(), title: "T" });

  test("GET /openapi.json serves the document without auth", async () => {
    const res = await panel().fetch(get("/openapi.json"));
    expect(res.status).toBe(200);
    expect((await res.json()).openapi).toBe("3.1.0");
  });

  test("GET /api/openapi.json serves the document", async () => {
    const res = await panel().fetch(get("/api/openapi.json"));
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect((doc.info as { title: string }).title).toBe("T");
  });

  test("openapi.json is reachable even with auth configured (public)", async () => {
    const { fetch } = createFetchHandler({
      sourceStorage: createMemoryStorage(),
      auth: { authenticate: async () => null },
    });
    const res = await fetch(get("/api/openapi.json"));
    expect(res.status).toBe(200);
  });
});
