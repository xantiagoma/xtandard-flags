import { describe, expect, test } from "vitest";
import {
  inlineSegmentsInFlag,
  referencedSegmentKeys,
  SegmentResolutionError,
  validateSegmentReferences,
} from "../src/segments.ts";
import { validateSegment } from "../src/validation.ts";
import { createFlagsCore, NotFoundError } from "../src/core.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { evaluateFlag } from "../src/evaluator.ts";
import type { Flag, Segment } from "../src/schema.ts";
import { booleanFlag } from "./fixtures.ts";

const seg = (key: string, conditions: Segment["conditions"]): Segment => ({ key, conditions });

const flagWithSegmentRule = (segmentKey: string): Flag =>
  booleanFlag({
    enabled: true,
    rules: [
      {
        id: "r1",
        conditions: [{ attribute: "_", operator: "inSegment", value: segmentKey }],
        serve: { variant: "on" },
      },
    ],
  });

describe("segments — validation", () => {
  test("validateSegment accepts a well-formed segment", () => {
    const r = validateSegment(seg("eu", [{ attribute: "country", operator: "in", value: ["FR"] }]));
    expect(r.valid).toBe(true);
  });

  test("validateSegment rejects a bad key", () => {
    expect(validateSegment(seg("has space", [])).valid).toBe(false);
  });

  test("inSegment condition requires a non-empty string key", () => {
    const r = validateSegment({
      key: "x",
      conditions: [{ attribute: "_", operator: "inSegment" }],
    });
    expect(r.valid).toBe(false);
  });
});

describe("segments — inlining", () => {
  const segments: Record<string, Segment> = {
    eu: seg("eu", [{ attribute: "country", operator: "in", value: ["FR", "DE"] }]),
    beta: seg("beta", [
      { attribute: "plan", operator: "equals", value: "beta" },
      { attribute: "_", operator: "inSegment", value: "eu" }, // nested
    ]),
  };

  test("inlines a direct segment reference into rule conditions", () => {
    const out = inlineSegmentsInFlag(flagWithSegmentRule("eu"), segments);
    expect(out.rules![0]!.conditions).toEqual([
      { attribute: "country", operator: "in", value: ["FR", "DE"] },
    ]);
    // no inSegment operator survives
    expect(out.rules![0]!.conditions.some((c) => c.operator === "inSegment")).toBe(false);
  });

  test("resolves nested segments recursively", () => {
    const out = inlineSegmentsInFlag(flagWithSegmentRule("beta"), segments);
    expect(out.rules![0]!.conditions).toEqual([
      { attribute: "plan", operator: "equals", value: "beta" },
      { attribute: "country", operator: "in", value: ["FR", "DE"] },
    ]);
  });

  test("the inlined flag evaluates as if conditions were written inline", () => {
    const out = inlineSegmentsInFlag(flagWithSegmentRule("eu"), segments);
    expect(evaluateFlag(out, { targetingKey: "u", country: "FR" }).value).toBe(true);
    expect(evaluateFlag(out, { targetingKey: "u", country: "US" }).value).toBe(false);
  });

  test("throws on a missing segment", () => {
    expect(() => inlineSegmentsInFlag(flagWithSegmentRule("ghost"), segments)).toThrow(
      SegmentResolutionError,
    );
  });

  test("throws on a cyclic reference", () => {
    const cyclic: Record<string, Segment> = {
      a: seg("a", [{ attribute: "_", operator: "inSegment", value: "b" }]),
      b: seg("b", [{ attribute: "_", operator: "inSegment", value: "a" }]),
    };
    expect(() => inlineSegmentsInFlag(flagWithSegmentRule("a"), cyclic)).toThrow(
      SegmentResolutionError,
    );
  });

  test("referencedSegmentKeys lists direct references", () => {
    expect(referencedSegmentKeys(flagWithSegmentRule("eu"))).toEqual(["eu"]);
  });
});

describe("segments — reference validation", () => {
  test("flags { } + segments { } → no errors", () => {
    expect(validateSegmentReferences({}, {})).toEqual([]);
  });

  test("dangling flag reference is reported", () => {
    const errs = validateSegmentReferences({ f: flagWithSegmentRule("ghost") }, {});
    expect(errs.length).toBe(1);
    expect(errs[0]!.path).toBe("flags.f.rules[0]");
  });

  test("cycle among segments is reported", () => {
    const segments: Record<string, Segment> = {
      a: seg("a", [{ attribute: "_", operator: "inSegment", value: "b" }]),
      b: seg("b", [{ attribute: "_", operator: "inSegment", value: "a" }]),
    };
    const errs = validateSegmentReferences({}, segments);
    expect(errs.length).toBeGreaterThan(0);
  });
});

describe("segments — core + publish", () => {
  const makeCore = () => createFlagsCore({ sourceStorage: createMemoryStorage() });

  test("CRUD round-trip", async () => {
    const core = makeCore();
    await core.upsertSegment(seg("eu", [{ attribute: "country", operator: "in", value: ["FR"] }]));
    expect((await core.listSegments()).map((s) => s.key)).toEqual(["eu"]);
    expect(await core.getSegment("eu")).toMatchObject({ key: "eu" });
    await core.deleteSegment("eu");
    expect(await core.getSegment("eu")).toBeNull();
    await expect(core.deleteSegment("eu")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("publish inlines segments into the snapshot (no inSegment survives)", async () => {
    const core = makeCore();
    await core.upsertSegment(seg("eu", [{ attribute: "country", operator: "in", value: ["FR"] }]));
    await core.upsertFlag(flagWithSegmentRule("eu"));
    const snap = await core.publish();
    const conditions = snap.flags["new-dashboard"]!.rules![0]!.conditions;
    expect(conditions).toEqual([{ attribute: "country", operator: "in", value: ["FR"] }]);
  });

  test("publish fails on a dangling segment reference", async () => {
    const core = makeCore();
    await core.upsertFlag(flagWithSegmentRule("ghost"));
    await expect(core.publish()).rejects.toThrow(/segment/i);
  });

  test("draft evaluation resolves segments on the fly", async () => {
    const core = makeCore();
    await core.upsertSegment(seg("eu", [{ attribute: "country", operator: "in", value: ["FR"] }]));
    await core.upsertFlag(flagWithSegmentRule("eu"));
    const inFr = await core.evaluate({
      context: { targetingKey: "u", country: "FR" },
      flagKey: "new-dashboard",
      source: "draft",
    });
    expect(inFr[0]!.value).toBe(true);
    const inUs = await core.evaluate({
      context: { targetingKey: "u", country: "US" },
      flagKey: "new-dashboard",
      source: "draft",
    });
    expect(inUs[0]!.value).toBe(false);
  });
});

describe("segments — HTTP routes", () => {
  const BASE = "/api/projects/default/environments/production";
  test("POST/GET/PUT/DELETE segments", async () => {
    const { fetch } = createFetchHandler({ sourceStorage: createMemoryStorage() });
    const jreq = (method: string, path: string, body?: unknown) =>
      fetch(
        new Request(`http://localhost${path}`, {
          method,
          headers: body !== undefined ? { "content-type": "application/json" } : {},
          body: body !== undefined ? JSON.stringify(body) : undefined,
        }),
      );

    const created = await jreq("POST", `${BASE}/segments`, {
      key: "eu",
      conditions: [{ attribute: "country", operator: "in", value: ["FR"] }],
    });
    expect(created.status).toBe(201);

    const list = await (await jreq("GET", `${BASE}/segments`)).json();
    expect(list).toHaveLength(1);

    const put = await jreq("PUT", `${BASE}/segments/eu`, { key: "ignored", conditions: [] });
    expect((await put.json()).key).toBe("eu");

    const del = await jreq("DELETE", `${BASE}/segments/eu`);
    expect((await del.json()).ok).toBe(true);
    expect((await jreq("GET", `${BASE}/segments/eu`)).status).toBe(404);
  });

  test("invalid segment → 422", async () => {
    const { fetch } = createFetchHandler({ sourceStorage: createMemoryStorage() });
    const res = await fetch(
      new Request(`http://localhost${BASE}/segments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "bad key", conditions: [] }),
      }),
    );
    expect(res.status).toBe(422);
  });
});
