import { describe, expect, test } from "vitest";
import { createFlagsCore } from "../src/core.ts";
import { evaluateFlag, evaluateNode, matchesRule } from "../src/evaluator.ts";
import type { ConditionNode, Flag, Segment } from "../src/schema.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag } from "./fixtures.ts";

const ctx = (o: Record<string, unknown>) => ({ targetingKey: "u", ...o });

describe("evaluateNode — AND / OR / NOT groups", () => {
  test("any = OR", () => {
    const node: ConditionNode = {
      any: [
        { attribute: "seats", operator: "greaterThan", value: 10 },
        { attribute: "role", operator: "equals", value: "admin" },
      ],
    };
    expect(evaluateNode(node, ctx({ seats: 50 }))).toBe(true);
    expect(evaluateNode(node, ctx({ role: "admin" }))).toBe(true);
    expect(evaluateNode(node, ctx({ seats: 2, role: "user" }))).toBe(false);
  });

  test("all = AND", () => {
    const node: ConditionNode = {
      all: [
        { attribute: "plan", operator: "equals", value: "pro" },
        { attribute: "seats", operator: "greaterThan", value: 10 },
      ],
    };
    expect(evaluateNode(node, ctx({ plan: "pro", seats: 50 }))).toBe(true);
    expect(evaluateNode(node, ctx({ plan: "pro", seats: 2 }))).toBe(false);
  });

  test("not negates a subtree", () => {
    const node: ConditionNode = {
      not: {
        all: [
          { attribute: "country", operator: "equals", value: "US" },
          { attribute: "plan", operator: "equals", value: "free" },
        ],
      },
    };
    expect(evaluateNode(node, ctx({ country: "US", plan: "free" }))).toBe(false);
    expect(evaluateNode(node, ctx({ country: "US", plan: "pro" }))).toBe(true);
  });

  test("nested: pro AND (seats>10 OR role=admin)", () => {
    const conditions: ConditionNode[] = [
      { attribute: "plan", operator: "equals", value: "pro" },
      {
        any: [
          { attribute: "seats", operator: "greaterThan", value: 10 },
          { attribute: "role", operator: "equals", value: "admin" },
        ],
      },
    ];
    expect(matchesRule(conditions, ctx({ plan: "pro", role: "admin" }))).toBe(true);
    expect(matchesRule(conditions, ctx({ plan: "pro", seats: 99 }))).toBe(true);
    expect(matchesRule(conditions, ctx({ plan: "pro", seats: 1, role: "user" }))).toBe(false);
    expect(matchesRule(conditions, ctx({ plan: "free", role: "admin" }))).toBe(false);
  });

  test("empty all matches; empty any does not; malformed group fails closed", () => {
    expect(evaluateNode({ all: [] }, ctx({}))).toBe(true);
    expect(evaluateNode({ any: [] }, ctx({}))).toBe(false);
    expect(evaluateNode({} as ConditionNode, ctx({}))).toBe(false);
  });
});

describe("groups in a flag rule (end to end)", () => {
  const flag = (): Flag =>
    booleanFlag({
      enabled: true,
      defaultVariant: "off",
      fallthrough: { variant: "off" },
      rules: [
        {
          id: "r",
          conditions: [
            { attribute: "plan", operator: "equals", value: "pro" },
            {
              any: [
                { attribute: "seats", operator: "greaterThan", value: 10 },
                { not: { attribute: "region", operator: "equals", value: "test" } },
              ],
            },
          ],
          serve: { variant: "on" },
        },
      ],
    });

  test("evaluateFlag honours the group tree", () => {
    expect(evaluateFlag(flag(), ctx({ plan: "pro", seats: 99 })).variant).toBe("on");
    expect(evaluateFlag(flag(), ctx({ plan: "pro", region: "prod" })).variant).toBe("on"); // not test
    expect(evaluateFlag(flag(), ctx({ plan: "pro", seats: 1, region: "test" })).variant).toBe(
      "off",
    );
    expect(evaluateFlag(flag(), ctx({ plan: "free", seats: 99 })).variant).toBe("off");
  });

  test("publish + active evaluation works with groups", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertFlag(flag());
    await core.publish();
    const r = await core.evaluate({
      context: ctx({ plan: "pro", seats: 99 }),
      flagKey: "new-dashboard",
      source: "active",
    });
    expect(r[0]!.variant).toBe("on");
  });
});

describe("segments inside groups", () => {
  const segments: Record<string, Segment> = {
    eu: { key: "eu", conditions: [{ attribute: "country", operator: "in", value: ["FR", "DE"] }] },
  };

  test("single-key inSegment inside an OR group resolves as membership", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertSegment(segments.eu!);
    await core.upsertFlag(
      booleanFlag({
        enabled: true,
        defaultVariant: "off",
        fallthrough: { variant: "off" },
        rules: [
          {
            id: "r",
            conditions: [
              {
                any: [
                  { attribute: "", operator: "inSegment", value: "eu" },
                  { attribute: "vip", operator: "equals", value: true },
                ],
              },
            ],
            serve: { variant: "on" },
          },
        ],
      }),
    );
    await core.publish();
    // member of eu (OR arm 1)
    const eu = await core.evaluate({
      context: ctx({ country: "FR" }),
      flagKey: "new-dashboard",
      source: "active",
    });
    expect(eu[0]!.variant).toBe("on");
    // vip (OR arm 2)
    const vip = await core.evaluate({
      context: ctx({ country: "US", vip: true }),
      flagKey: "new-dashboard",
      source: "active",
    });
    expect(vip[0]!.variant).toBe("on");
    // neither
    const no = await core.evaluate({
      context: ctx({ country: "US", vip: false }),
      flagKey: "new-dashboard",
      source: "active",
    });
    expect(no[0]!.variant).toBe("off");
  });
});
