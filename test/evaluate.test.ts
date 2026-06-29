import { describe, expect, test } from "vitest";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { createTestPanel } from "../src/testing.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { themeFlag } from "./fixtures.ts";

describe("core.evaluate (test targeting)", () => {
  test("evaluates the draft against a context with a matching rule", async () => {
    const { core } = createTestPanel();
    await core.upsertFlag(
      themeFlag({
        rules: [
          {
            id: "co",
            conditions: [{ attribute: "country", operator: "equals", value: "CO" }],
            serve: { variant: "xmas" },
          },
        ],
      }),
    );
    const co = await core.evaluate({
      context: { targetingKey: "u1", country: "CO" },
      flagKey: "theme",
    });
    expect(co[0]).toMatchObject({
      key: "theme",
      value: "xmas",
      variant: "xmas",
      reason: "TARGETING_MATCH",
    });

    const other = await core.evaluate({
      context: { targetingKey: "u1", country: "US" },
      flagKey: "theme",
    });
    expect(other[0]).toMatchObject({ value: "normal", reason: "STATIC" });
  });

  test("evaluates all flags when no flagKey is given", async () => {
    const { core } = createTestPanel();
    await core.upsertFlag(themeFlag());
    const results = await core.evaluate({ context: { targetingKey: "u" } });
    expect(results.map((r) => r.key)).toContain("theme");
  });

  test("can target the active snapshot instead of the draft", async () => {
    const { core } = createTestPanel();
    await core.upsertFlag(themeFlag());
    await core.publish();
    // Change the draft after publishing.
    await core.upsertFlag(themeFlag({ enabled: false, defaultVariant: "halloween" }));
    const draft = await core.evaluate({ context: {}, flagKey: "theme", source: "draft" });
    const active = await core.evaluate({ context: {}, flagKey: "theme", source: "active" });
    expect(draft[0]?.reason).toBe("DISABLED"); // draft is now disabled
    expect(active[0]?.reason).toBe("STATIC"); // published snapshot still enabled
  });
});

describe("server — POST /evaluate", () => {
  test("returns evaluation results for a context", async () => {
    const { fetch } = createFetchHandler({ sourceStorage: createMemoryStorage() });
    const base = "/api/projects/default/environments/production";
    await fetch(
      new Request(`http://x${base}/flags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(themeFlag()),
      }),
    );
    const res = await fetch(
      new Request(`http://x${base}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: { targetingKey: "u1" }, flagKey: "theme" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ key: "theme", value: "normal" });
  });
});
