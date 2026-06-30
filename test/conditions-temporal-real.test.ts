import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { evaluateCondition } from "../src/evaluator.ts";
import type { Condition } from "../src/schema.ts";

// Bun has no native Temporal yet, so we install the polyfill on globalThis for
// these tests — exercising the evaluator's real Temporal dispatch (instanceof +
// each type's static from/compare), not a mock.
const g = globalThis as { Temporal?: unknown };
let prev: unknown;
beforeAll(() => {
  prev = g.Temporal;
  g.Temporal = Temporal;
});
afterAll(() => {
  if (prev === undefined) delete g.Temporal;
  else g.Temporal = prev;
});

const cond = (operator: Condition["operator"], value: unknown): Condition => ({
  attribute: "v",
  operator,
  value: value as Condition["value"],
});

describe("real Temporal — ordering via static compare/from", () => {
  test("PlainDate vs ISO string threshold", () => {
    const ctx = { v: Temporal.PlainDate.from("2026-07-01") };
    expect(evaluateCondition(cond("after", "2026-01-01"), ctx)).toBe(true);
    expect(evaluateCondition(cond("before", "2026-01-01"), ctx)).toBe(false);
    expect(evaluateCondition(cond("greaterThanOrEqual", "2026-07-01"), ctx)).toBe(true);
  });

  test("PlainTime (wall clock, no date/epoch)", () => {
    const ctx = { v: Temporal.PlainTime.from("14:00") };
    expect(evaluateCondition(cond("after", "09:00"), ctx)).toBe(true);
    expect(evaluateCondition(cond("before", "18:00"), ctx)).toBe(true);
  });

  test("PlainYearMonth", () => {
    const ctx = { v: Temporal.PlainYearMonth.from("2026-07") };
    expect(evaluateCondition(cond("after", "2026-01"), ctx)).toBe(true);
  });

  test("Instant", () => {
    const ctx = { v: Temporal.Instant.from("2026-07-01T00:00:00Z") };
    expect(evaluateCondition(cond("after", "2026-01-01T00:00:00Z"), ctx)).toBe(true);
  });

  test("Duration (time units) — PT50M < PT1H, the user's example", () => {
    const ctx = { v: Temporal.Duration.from({ minutes: 50 }) };
    expect(evaluateCondition(cond("lessThan", "PT1H"), ctx)).toBe(true);
    expect(evaluateCondition(cond("before", "PT1H"), ctx)).toBe(true);
    expect(evaluateCondition(cond("greaterThan", "PT30M"), ctx)).toBe(true);
  });

  test("Duration (calendar units) needs relativeTo → fails closed, no throw", () => {
    const ctx = { v: Temporal.Duration.from({ months: 1 }) };
    expect(() => evaluateCondition(cond("before", "P2M"), ctx)).not.toThrow();
    expect(evaluateCondition(cond("before", "P2M"), ctx)).toBe(false);
  });

  test("mismatched Temporal kind (PlainDate vs a time string) fails closed", () => {
    const ctx = { v: Temporal.PlainDate.from("2026-07-01") };
    expect(evaluateCondition(cond("after", "14:00"), ctx)).toBe(false);
  });
});
