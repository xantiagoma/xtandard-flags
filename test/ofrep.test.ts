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
