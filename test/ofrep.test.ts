import { describe, expect, test } from "vitest";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { toOfrepEvaluation, toOfrepBulkResponse } from "../src/server/ofrep.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, themeFlag } from "./fixtures.ts";

describe("ofrep — payload mapping", () => {
  test("maps a successful evaluation", () => {
    const out = toOfrepEvaluation({
      key: "f",
      value: true,
      variant: "on",
      reason: "TARGETING_MATCH",
    });
    expect(out).toEqual({
      key: "f",
      value: true,
      variant: "on",
      reason: "TARGETING_MATCH",
      metadata: {},
    });
  });

  test("maps an error evaluation to errorCode (no value)", () => {
    const out = toOfrepEvaluation({
      key: "f",
      value: undefined,
      variant: undefined,
      reason: "ERROR",
      errorCode: "GENERAL",
    });
    expect(out.errorCode).toBe("GENERAL");
    expect(out.value).toBeUndefined();
    expect("reason" in out).toBe(false);
  });

  test("bulk wraps results under flags", () => {
    const out = toOfrepBulkResponse([
      { key: "a", value: 1, variant: "x", reason: "STATIC" },
      { key: "b", value: 2, variant: "y", reason: "STATIC" },
    ]);
    expect(out.flags.map((f) => f.key)).toEqual(["a", "b"]);
  });
});

describe("ofrep — HTTP", () => {
  const BASE = "/api/projects/default/environments/production";
  const setup = async () => {
    const { fetch } = createFetchHandler({ sourceStorage: createMemoryStorage() });
    const post = (path: string, body?: unknown) =>
      fetch(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: body !== undefined ? { "content-type": "application/json" } : {},
          body: body !== undefined ? JSON.stringify(body) : undefined,
        }),
      );
    await post(`${BASE}/flags`, booleanFlag());
    await post(`${BASE}/flags`, themeFlag());
    await post(`${BASE}/publish`, {});
    return { post };
  };

  test("bulk evaluate returns OFREP-shaped flags from the active snapshot", async () => {
    const { post } = await setup();
    const res = await post("/ofrep/v1/evaluate/flags", { context: { targetingKey: "u1" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { flags: { key: string; reason?: string }[] };
    expect(body.flags.map((f) => f.key).sort()).toEqual(["new-dashboard", "theme"]);
    expect(body.flags.every((f) => typeof f.reason === "string")).toBe(true);
  });

  test("single evaluate returns one flag", async () => {
    const { post } = await setup();
    const res = await post("/ofrep/v1/evaluate/flags/new-dashboard", {
      context: { targetingKey: "u1" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; value: unknown };
    expect(body.key).toBe("new-dashboard");
    expect(body.value).toBe(false);
  });

  test("single evaluate on a missing flag returns 404 + FLAG_NOT_FOUND", async () => {
    const { post } = await setup();
    const res = await post("/ofrep/v1/evaluate/flags/ghost", {});
    expect(res.status).toBe(404);
    expect((await res.json()).errorCode).toBe("FLAG_NOT_FOUND");
  });

  test("evaluates against the published snapshot, not the draft", async () => {
    const { post } = await setup();
    // add a draft-only flag after publish — should NOT appear in OFREP
    await post(`${BASE}/flags`, booleanFlag({ key: "draft-only" }));
    const res = await post("/ofrep/v1/evaluate/flags", {});
    const body = (await res.json()) as { flags: { key: string }[] };
    expect(body.flags.map((f) => f.key)).not.toContain("draft-only");
  });

  test("works with no body", async () => {
    const { post } = await setup();
    const res = await post("/ofrep/v1/evaluate/flags");
    expect(res.status).toBe(200);
  });
});

describe("ofrep — compliance: metadata, ETag/304, SSE", () => {
  const BASE = "/api/projects/default/environments/production";

  /** Build a handler, seed two flags, publish; return a raw `fetch`. */
  const seed = async (streaming = false) => {
    const { fetch } = createFetchHandler({ sourceStorage: createMemoryStorage(), streaming });
    const send = (path: string, init: RequestInit = {}) =>
      fetch(new Request(`http://localhost${path}`, init));
    const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
      send(path, {
        method: "POST",
        headers: {
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    await post(`${BASE}/flags`, booleanFlag());
    await post(`${BASE}/flags`, themeFlag());
    await post(`${BASE}/publish`, {});
    return { fetch, send, post };
  };

  test("evaluations carry metadata: snapshot version + flag type", async () => {
    const { post } = await seed();
    const res = await post("/ofrep/v1/evaluate/flags", { context: { targetingKey: "u1" } });
    const body = (await res.json()) as {
      flags: { key: string; metadata: { version?: string; flagType?: string } }[];
    };
    const bool = body.flags.find((f) => f.key === "new-dashboard")!;
    expect(bool.metadata.version).toBe("v1");
    expect(bool.metadata.flagType).toBe("boolean");
    const str = body.flags.find((f) => f.key === "theme")!;
    expect(str.metadata.flagType).toBe("string");
  });

  test("single evaluation also carries version metadata", async () => {
    const { post } = await seed();
    const res = await post("/ofrep/v1/evaluate/flags/theme", { context: { targetingKey: "u1" } });
    expect(((await res.json()) as { metadata: { version?: string } }).metadata.version).toBe("v1");
  });

  test("bulk returns an ETag and a matching If-None-Match yields 304", async () => {
    const { post } = await seed();
    const ctxBody = { context: { targetingKey: "u1" } };
    const first = await post("/ofrep/v1/evaluate/flags", ctxBody);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const cached = await post("/ofrep/v1/evaluate/flags", ctxBody, { "if-none-match": etag! });
    expect(cached.status).toBe(304);
    expect(cached.headers.get("etag")).toBe(etag);
    expect((await cached.text()).length).toBe(0);
  });

  test("ETag changes after a new publish", async () => {
    const { post } = await seed();
    const ctxBody = { context: { targetingKey: "u1" } };
    const etag1 = (await post("/ofrep/v1/evaluate/flags", ctxBody)).headers.get("etag");
    // publish again → new active version → new ETag
    await post(`${BASE}/flags`, themeFlag({ description: "changed" }));
    await post(`${BASE}/publish`, {});
    const etag2 = (await post("/ofrep/v1/evaluate/flags", ctxBody)).headers.get("etag");
    expect(etag2).not.toBe(etag1);
  });

  test("streaming OFF (default): no stream endpoint, no eventStreams", async () => {
    const { send, post } = await seed(false);
    const stream = await send("/ofrep/v1/stream");
    expect(stream.status).toBe(404);
    const body = (await post("/ofrep/v1/evaluate/flags", {})) as Response;
    expect("eventStreams" in (await body.json())).toBe(false);
  });

  test("streaming ON: SSE stream opens and bulk advertises eventStreams", async () => {
    const { send, post } = await seed(true);

    const bulk = await (await post("/ofrep/v1/evaluate/flags", {})).json();
    expect(bulk.eventStreams).toEqual([{ url: "/ofrep/v1/stream" }]);

    const stream = await send("/ofrep/v1/stream");
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value!)).toContain("connected");
    await reader.cancel();
  });
});
