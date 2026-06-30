import { describe, expect, test } from "vitest";
import { evaluateFlag } from "../src/evaluator.ts";
import { compileDraft } from "../src/snapshot.ts";
import { createFlagsCore } from "../src/core.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import type { Flag, Segment } from "../src/schema.ts";
import { booleanFlag, draft as makeDraft } from "./fixtures.ts";

const seg = (key: string, conditions: Segment["conditions"]): Segment => ({ key, conditions });

// A flag served "on" only when the context is NOT in the "internal" segment.
const gatedFlag = (): Flag =>
  booleanFlag({
    enabled: true,
    defaultVariant: "off",
    fallthrough: { variant: "off" },
    rules: [
      {
        id: "external-only",
        conditions: [{ attribute: "", operator: "notInSegment", value: "internal" }],
        serve: { variant: "on" },
      },
    ],
  });

const segments: Record<string, Segment> = {
  internal: seg("internal", [
    { attribute: "email", operator: "endsWith", value: "@acme.internal" },
  ]),
};

describe("notInSegment — evaluator", () => {
  test("context NOT in the segment → rule matches", () => {
    const r = evaluateFlag(gatedFlag(), { targetingKey: "u", email: "a@gmail.com" }, {}, segments);
    expect(r.variant).toBe("on");
    expect(r.reason).toBe("TARGETING_MATCH");
  });

  test("context IN the segment → rule does not match (default)", () => {
    const r = evaluateFlag(
      gatedFlag(),
      { targetingKey: "u", email: "boss@acme.internal" },
      {},
      segments,
    );
    expect(r.variant).toBe("off");
  });

  test("missing/empty segment map → not in a nonexistent segment is true", () => {
    const r = evaluateFlag(gatedFlag(), { targetingKey: "u", email: "x@y.z" }, {}, {});
    expect(r.variant).toBe("on");
  });

  test("cyclic notInSegment is guarded (no infinite recursion)", () => {
    const cyclic: Record<string, Segment> = {
      a: seg("a", [{ attribute: "", operator: "notInSegment", value: "b" }]),
      b: seg("b", [{ attribute: "", operator: "notInSegment", value: "a" }]),
    };
    const f = booleanFlag({
      enabled: true,
      defaultVariant: "off",
      fallthrough: { variant: "off" },
      rules: [
        {
          id: "r",
          conditions: [{ attribute: "", operator: "notInSegment", value: "a" }],
          serve: { variant: "on" },
        },
      ],
    });
    // Should terminate and produce a boolean outcome, not hang/throw.
    expect(() => evaluateFlag(f, { targetingKey: "u" }, {}, cyclic)).not.toThrow();
  });
});

describe("notInSegment — compile + core", () => {
  test("compileDraft embeds resolved segments when notInSegment is used", () => {
    const d = makeDraft([gatedFlag()]);
    const snap = compileDraft(d, { version: "v1", segments });
    expect(snap.segments).toBeDefined();
    expect(snap.segments!.internal).toBeDefined();
    // inSegment-only flags would NOT embed segments:
    const plain = compileDraft(makeDraft([booleanFlag()]), { version: "v1", segments });
    expect(plain.segments).toBeUndefined();
  });

  test("publish + active evaluation resolves notInSegment via embedded segments", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertSegment(segments.internal!);
    await core.upsertFlag(gatedFlag());
    await core.publish();

    const ext = await core.evaluate({
      context: { targetingKey: "u", email: "a@gmail.com" },
      flagKey: "new-dashboard",
      source: "active",
    });
    expect(ext[0]!.variant).toBe("on");

    const int = await core.evaluate({
      context: { targetingKey: "u", email: "x@acme.internal" },
      flagKey: "new-dashboard",
      source: "active",
    });
    expect(int[0]!.variant).toBe("off");
  });

  test("publish rejects a dangling notInSegment reference", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertFlag(gatedFlag()); // references segment "internal" which doesn't exist
    await expect(core.publish()).rejects.toThrow(/segment/i);
  });

  test("draft evaluation resolves notInSegment on the fly", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertSegment(segments.internal!);
    await core.upsertFlag(gatedFlag());
    const res = await core.evaluate({
      context: { targetingKey: "u", email: "a@gmail.com" },
      flagKey: "new-dashboard",
      source: "draft",
    });
    expect(res[0]!.variant).toBe("on");
  });
});
