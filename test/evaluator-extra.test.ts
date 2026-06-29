import { describe, expect, test } from "vitest";
import { compareSemver, evaluateFlag, pickVariant } from "../src/evaluator.ts";
import { themeFlag } from "./fixtures.ts";

describe("compareSemver — prerelease precedence", () => {
  test("equal versions with equal prereleases compare 0", () => {
    expect(compareSemver("1.0.0-alpha.1", "1.0.0-alpha.1")).toBe(0);
  });

  test("a prerelease has lower precedence than the release", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(compareSemver("1.0.0", "1.0.0-alpha")).toBe(1);
  });

  test("numeric vs alphanumeric prerelease identifiers", () => {
    // numeric identifiers have lower precedence than alphanumeric
    expect(compareSemver("1.0.0-1", "1.0.0-alpha")).toBe(-1);
    expect(compareSemver("1.0.0-alpha", "1.0.0-1")).toBe(1);
  });

  test("numeric prerelease identifiers compare numerically", () => {
    expect(compareSemver("1.0.0-1", "1.0.0-2")).toBe(-1);
    expect(compareSemver("1.0.0-2", "1.0.0-1")).toBe(1);
  });

  test("alphanumeric identifiers compare lexically", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
  });

  test("a longer prerelease (with all-equal prefix) has higher precedence", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareSemver("1.0.0-alpha.1", "1.0.0-alpha")).toBe(1);
  });

  test("invalid input returns undefined", () => {
    expect(compareSemver("not-semver", "1.0.0")).toBeUndefined();
    expect(compareSemver(42, "1.0.0")).toBeUndefined();
  });

  test("minor/patch differences are ordered", () => {
    expect(compareSemver("1.1.0", "1.2.0")).toBe(-1);
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
  });
});

describe("pickVariant — degenerate splits", () => {
  test("returns undefined when no leg has a positive weight", () => {
    expect(
      pickVariant({
        flagKey: "f",
        targetingKey: "u1",
        split: [
          { variant: "a", weight: 0 },
          { variant: "b", weight: 0 },
        ],
      }),
    ).toBeUndefined();
  });

  test("single positive leg always wins", () => {
    expect(
      pickVariant({ flagKey: "f", targetingKey: "u1", split: [{ variant: "only", weight: 5 }] }),
    ).toBe("only");
  });
});

describe("evaluateFlag — error paths", () => {
  test("override pointing at an unknown variant → ERROR", () => {
    const flag = themeFlag({ overrides: [{ targetingKey: "u1", variant: "ghost" }] });
    const r = evaluateFlag(flag, { targetingKey: "u1" });
    expect(r.reason).toBe("ERROR");
    expect(r.errorMessage).toContain("override");
  });

  test("fallthrough split selecting an unknown variant → ERROR", () => {
    const flag = themeFlag({
      fallthrough: { split: [{ variant: "ghost", weight: 100 }] },
    });
    const r = evaluateFlag(flag, { targetingKey: "u1" });
    expect(r.reason).toBe("ERROR");
    expect(r.errorMessage).toContain("split selected unknown variant");
  });

  test("split with no bucketing key degrades to default (TARGETING_KEY_MISSING)", () => {
    const flag = themeFlag({
      fallthrough: { split: [{ variant: "xmas", weight: 100 }] },
    });
    const r = evaluateFlag(flag, {});
    expect(r.reason).toBe("DEFAULT");
    expect(r.errorCode).toBe("TARGETING_KEY_MISSING");
    expect(r.variant).toBe("normal");
  });

  test("split with no bucketing key AND unknown default variant → ERROR", () => {
    const flag = themeFlag({
      defaultVariant: "normal",
      variants: { other: { value: "o" } },
      fallthrough: { split: [{ variant: "other", weight: 100 }] },
    });
    const r = evaluateFlag(flag, {});
    expect(r.reason).toBe("ERROR");
    expect(r.errorMessage).toContain("default variant");
  });

  test("disabled flag with unknown default variant → ERROR", () => {
    const flag = themeFlag({ enabled: false, defaultVariant: "ghost" });
    const r = evaluateFlag(flag, {});
    expect(r.reason).toBe("ERROR");
  });

  test("rule matching but referencing an unknown variant → ERROR", () => {
    const flag = themeFlag({
      rules: [{ id: "r1", conditions: [], serve: { variant: "ghost" } }],
    });
    const r = evaluateFlag(flag, { targetingKey: "u1" });
    expect(r.reason).toBe("ERROR");
    expect(r.errorMessage).toContain("serve references unknown variant");
  });

  test("rule with empty conditions matches (TARGETING_MATCH)", () => {
    const flag = themeFlag({
      rules: [{ id: "r1", conditions: [], serve: { variant: "xmas" } }],
    });
    const r = evaluateFlag(flag, { targetingKey: "u1" });
    expect(r.reason).toBe("TARGETING_MATCH");
    expect(r.variant).toBe("xmas");
  });
});
