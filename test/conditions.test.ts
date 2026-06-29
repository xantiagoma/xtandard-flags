import { describe, expect, test } from "vitest";
import { compareSemver, evaluateCondition } from "../src/evaluator.ts";
import type { Condition, ConditionOperator } from "../src/schema.ts";

const cond = (operator: ConditionOperator, value?: unknown, attribute = "x"): Condition =>
  ({ attribute, operator, value } as Condition);

describe("condition operators", () => {
  test("equals / notEquals (with cross-type coercion)", () => {
    expect(evaluateCondition(cond("equals", "CO"), { x: "CO" })).toBe(true);
    expect(evaluateCondition(cond("equals", 42), { x: "42" })).toBe(true);
    expect(evaluateCondition(cond("notEquals", "CO"), { x: "US" })).toBe(true);
  });

  test("in / notIn", () => {
    expect(evaluateCondition(cond("in", ["CO", "US"]), { x: "US" })).toBe(true);
    expect(evaluateCondition(cond("in", ["CO", "US"]), { x: "MX" })).toBe(false);
    expect(evaluateCondition(cond("notIn", ["CO", "US"]), { x: "MX" })).toBe(true);
  });

  test("contains / notContains (string and array)", () => {
    expect(evaluateCondition(cond("contains", "ell"), { x: "hello" })).toBe(true);
    expect(evaluateCondition(cond("contains", "beta"), { x: ["alpha", "beta"] })).toBe(true);
    expect(evaluateCondition(cond("notContains", "z"), { x: "hello" })).toBe(true);
  });

  test("startsWith / endsWith", () => {
    expect(evaluateCondition(cond("startsWith", "he"), { x: "hello" })).toBe(true);
    expect(evaluateCondition(cond("endsWith", "lo"), { x: "hello" })).toBe(true);
    expect(evaluateCondition(cond("startsWith", "x"), { x: 123 })).toBe(false);
  });

  test("numeric comparisons", () => {
    expect(evaluateCondition(cond("greaterThan", 10), { x: 20 })).toBe(true);
    expect(evaluateCondition(cond("greaterThanOrEqual", 20), { x: 20 })).toBe(true);
    expect(evaluateCondition(cond("lessThan", 10), { x: 5 })).toBe(true);
    expect(evaluateCondition(cond("lessThanOrEqual", 5), { x: 5 })).toBe(true);
    expect(evaluateCondition(cond("greaterThan", 10), { x: "not-a-number" })).toBe(false);
  });

  test("semver comparisons", () => {
    expect(evaluateCondition(cond("semverGreaterThan", "1.2.0"), { x: "1.3.0" })).toBe(true);
    expect(evaluateCondition(cond("semverLessThan", "2.0.0"), { x: "1.9.9" })).toBe(true);
    expect(evaluateCondition(cond("semverEquals", "1.0.0"), { x: "1.0.0" })).toBe(true);
    expect(evaluateCondition(cond("semverGreaterThan", "1.0.0"), { x: "garbage" })).toBe(false);
  });

  test("exists / notExists", () => {
    expect(evaluateCondition(cond("exists"), { x: "v" })).toBe(true);
    expect(evaluateCondition(cond("exists"), { x: null })).toBe(false);
    expect(evaluateCondition(cond("notExists"), {})).toBe(true);
  });
});

describe("compareSemver", () => {
  test("orders core versions", () => {
    expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  test("prerelease has lower precedence than release", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareSemver("1.0.0-alpha.1", "1.0.0-alpha.2")).toBe(-1);
  });

  test("tolerates a leading v and build metadata", () => {
    expect(compareSemver("v1.2.0", "1.2.0")).toBe(0);
    expect(compareSemver("1.2.0+build", "1.2.0")).toBe(0);
  });

  test("returns undefined for invalid input", () => {
    expect(compareSemver("nope", "1.0.0")).toBeUndefined();
  });
});
