import { describe, expect, test } from "vitest";
import { createFlagsCore } from "../src/core.ts";
import { evaluateFlag } from "../src/evaluator.ts";
import type { Flag, Segment } from "../src/schema.ts";
import { compileDraft } from "../src/snapshot.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, draft as makeDraft } from "./fixtures.ts";

const seg = (key: string, conditions: Segment["conditions"]): Segment => ({ key, conditions });

const segments: Record<string, Segment> = {
  eu: seg("eu", [{ attribute: "country", operator: "in", value: ["FR", "DE", "ES"] }]),
  staff: seg("staff", [{ attribute: "email", operator: "endsWith", value: "@acme.com" }]),
};

// Served "on" when the context is in EITHER segment (OR via an array inSegment).
const anyOfFlag = (op: "inSegment" | "notInSegment" = "inSegment"): Flag =>
  booleanFlag({
    enabled: true,
    defaultVariant: "off",
    fallthrough: { variant: "off" },
    rules: [
      {
        id: "any-of",
        conditions: [{ attribute: "", operator: op, value: ["eu", "staff"] }],
        serve: { variant: "on" },
      },
    ],
  });

describe("inSegment array (OR) — evaluator", () => {
  test("member of the FIRST listed segment → match", () => {
    const r = evaluateFlag(anyOfFlag(), { targetingKey: "u", country: "FR" }, {}, segments);
    expect(r.variant).toBe("on");
    expect(r.reason).toBe("TARGETING_MATCH");
  });

  test("member of the SECOND listed segment → match", () => {
    const r = evaluateFlag(anyOfFlag(), { targetingKey: "u", email: "x@acme.com" }, {}, segments);
    expect(r.variant).toBe("on");
  });

  test("member of NEITHER → no match (default)", () => {
    const r = evaluateFlag(
      anyOfFlag(),
      { targetingKey: "u", country: "US", email: "x@gmail.com" },
      {},
      segments,
    );
    expect(r.variant).toBe("off");
  });

  test("single-key string value still works (back-compat)", () => {
    const f = booleanFlag({
      enabled: true,
      defaultVariant: "off",
      fallthrough: { variant: "off" },
      rules: [
        {
          id: "r",
          conditions: [{ attribute: "", operator: "inSegment", value: "eu" }],
          serve: { variant: "on" },
        },
      ],
    });
    // (Embedded here; at compile time a single key is inlined instead.)
    expect(evaluateFlag(f, { targetingKey: "u", country: "DE" }, {}, segments).variant).toBe("on");
  });
});

describe("notInSegment array (NONE) — evaluator", () => {
  test("in one of them → not-in-none is false (default)", () => {
    const r = evaluateFlag(
      anyOfFlag("notInSegment"),
      { targetingKey: "u", country: "FR" },
      {},
      segments,
    );
    expect(r.variant).toBe("off");
  });

  test("in none of them → matches", () => {
    const r = evaluateFlag(
      anyOfFlag("notInSegment"),
      { targetingKey: "u", country: "US", email: "x@gmail.com" },
      {},
      segments,
    );
    expect(r.variant).toBe("on");
  });
});

describe("inSegment array — compile + core", () => {
  test("compileDraft embeds resolved segments for an array inSegment", () => {
    const snap = compileDraft(makeDraft([anyOfFlag()]), { version: "v1", segments });
    expect(snap.segments).toBeDefined();
    expect(snap.segments!.eu).toBeDefined();
    expect(snap.segments!.staff).toBeDefined();
    // The array condition is NOT inlined — it survives in the compiled rule.
    const cond = snap.flags["new-dashboard"]!.rules![0]!.conditions[0]!;
    expect(cond.operator).toBe("inSegment");
    expect(cond.value).toEqual(["eu", "staff"]);
  });

  test("a single-key inSegment is still inlined (no embedded segments)", () => {
    const f = booleanFlag({
      enabled: true,
      rules: [
        {
          id: "r",
          conditions: [{ attribute: "", operator: "inSegment", value: "eu" }],
          serve: { variant: "on" },
        },
      ],
    });
    const snap = compileDraft(makeDraft([f]), { version: "v1", segments });
    expect(snap.segments).toBeUndefined();
    // inlined → the rule now carries the segment's own condition, not inSegment.
    expect(snap.flags["new-dashboard"]!.rules![0]!.conditions[0]!.operator).toBe("in");
  });

  test("publish + active evaluation resolves an array inSegment", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertSegment(segments.eu!);
    await core.upsertSegment(segments.staff!);
    await core.upsertFlag(anyOfFlag());
    await core.publish();

    const hit = await core.evaluate({
      context: { targetingKey: "u", email: "x@acme.com" },
      flagKey: "new-dashboard",
      source: "active",
    });
    expect(hit[0]!.variant).toBe("on");
  });

  test("publish rejects a dangling key inside an array inSegment", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertSegment(segments.eu!);
    await core.upsertFlag(
      booleanFlag({
        enabled: true,
        rules: [
          {
            id: "r",
            conditions: [{ attribute: "", operator: "inSegment", value: ["eu", "ghost"] }],
            serve: { variant: "on" },
          },
        ],
      }),
    );
    await expect(core.publish()).rejects.toThrow(/segment/i);
  });
});
