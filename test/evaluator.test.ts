import { describe, expect, test } from "vitest";
import { evaluateFlag } from "../src/evaluator.ts";
import { booleanFlag, jsonFlag, numberFlag, themeFlag } from "./fixtures.ts";

describe("evaluateFlag — evaluation order", () => {
  test("disabled flag serves the default variant with reason DISABLED", () => {
    const r = evaluateFlag(booleanFlag({ enabled: false, fallthrough: { variant: "on" } }), {
      targetingKey: "u1",
    });
    expect(r).toMatchObject({ value: false, variant: "off", reason: "DISABLED" });
  });

  test("exact override beats rules and fallthrough (reason STATIC)", () => {
    const flag = themeFlag({
      overrides: [{ targetingKey: "user_123", variant: "halloween" }],
      rules: [
        {
          id: "r1",
          conditions: [{ attribute: "country", operator: "equals", value: "CO" }],
          serve: { variant: "xmas" },
        },
      ],
      fallthrough: { variant: "normal" },
    });
    const r = evaluateFlag(flag, { targetingKey: "user_123", country: "CO" });
    expect(r).toMatchObject({ value: "halloween", variant: "halloween", reason: "STATIC" });
  });

  test("override resolves via fallback bucketing attribute (userId)", () => {
    const flag = themeFlag({ overrides: [{ targetingKey: "u9", variant: "xmas" }] });
    const r = evaluateFlag(flag, { userId: "u9" });
    expect(r.variant).toBe("xmas");
    expect(r.reason).toBe("STATIC");
  });

  test("first matching rule wins", () => {
    const flag = themeFlag({
      rules: [
        {
          id: "co",
          conditions: [{ attribute: "country", operator: "equals", value: "CO" }],
          serve: { variant: "xmas" },
        },
        {
          id: "any",
          conditions: [],
          serve: { variant: "halloween" },
        },
      ],
    });
    expect(evaluateFlag(flag, { targetingKey: "u", country: "CO" }).variant).toBe("xmas");
    expect(evaluateFlag(flag, { targetingKey: "u", country: "US" }).variant).toBe("halloween");
  });

  test("rule match with reason TARGETING_MATCH", () => {
    const flag = themeFlag({
      rules: [
        {
          id: "co",
          conditions: [{ attribute: "country", operator: "equals", value: "CO" }],
          serve: { variant: "xmas" },
        },
      ],
    });
    expect(evaluateFlag(flag, { targetingKey: "u", country: "CO" }).reason).toBe("TARGETING_MATCH");
  });

  test("fallthrough fixed variant (reason STATIC)", () => {
    const r = evaluateFlag(themeFlag(), { targetingKey: "u" });
    expect(r).toMatchObject({ value: "normal", variant: "normal", reason: "STATIC" });
  });

  test("fallthrough split returns reason SPLIT", () => {
    const flag = themeFlag({
      fallthrough: {
        split: [
          { variant: "normal", weight: 50 },
          { variant: "xmas", weight: 50 },
        ],
      },
    });
    const r = evaluateFlag(flag, { targetingKey: "user-a" });
    expect(r.reason).toBe("SPLIT");
    expect(["normal", "xmas"]).toContain(r.variant);
  });

  test("number and json flags resolve their typed values", () => {
    expect(evaluateFlag(numberFlag(), { targetingKey: "u" }).value).toBe(10);
    expect(evaluateFlag(jsonFlag(), { targetingKey: "u" }).value).toEqual({ color: "blue", limit: 5 });
  });
});

describe("evaluateFlag — split without bucketing key", () => {
  test("degrades to default variant with TARGETING_KEY_MISSING", () => {
    const flag = themeFlag({
      fallthrough: {
        split: [
          { variant: "normal", weight: 50 },
          { variant: "xmas", weight: 50 },
        ],
      },
    });
    const r = evaluateFlag(flag, {});
    expect(r.variant).toBe("normal");
    expect(r.reason).toBe("DEFAULT");
    expect(r.errorCode).toBe("TARGETING_KEY_MISSING");
  });
});

describe("evaluateFlag — invalid config", () => {
  test("missing default variant → ERROR", () => {
    const flag = booleanFlag({ enabled: false, defaultVariant: "ghost" });
    const r = evaluateFlag(flag, {});
    expect(r.reason).toBe("ERROR");
    expect(r.value).toBeUndefined();
  });

  test("fallthrough references unknown variant → ERROR", () => {
    const flag = themeFlag({ fallthrough: { variant: "ghost" } });
    const r = evaluateFlag(flag, { targetingKey: "u" });
    expect(r.reason).toBe("ERROR");
  });

  test("override references unknown variant → ERROR", () => {
    const flag = themeFlag({ overrides: [{ targetingKey: "u", variant: "ghost" }] });
    const r = evaluateFlag(flag, { targetingKey: "u" });
    expect(r.reason).toBe("ERROR");
  });
});
