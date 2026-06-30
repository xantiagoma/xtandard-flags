import { describe, expect, test } from "vitest";
import { evaluateCondition } from "../src/evaluator.ts";
import type { Condition } from "../src/schema.ts";

const cond = (operator: Condition["operator"], value: unknown): Condition => ({
  attribute: "ts",
  operator,
  value: value as Condition["value"],
});

describe("date operators — before/after", () => {
  test("ISO string vs ISO string", () => {
    expect(evaluateCondition(cond("after", "2026-01-01"), { ts: "2026-06-30" })).toBe(true);
    expect(evaluateCondition(cond("before", "2026-01-01"), { ts: "2026-06-30" })).toBe(false);
    expect(evaluateCondition(cond("before", "2026-12-31"), { ts: "2026-06-30" })).toBe(true);
  });

  test("epoch-millis numbers", () => {
    const jan1 = Date.parse("2026-01-01T00:00:00Z");
    const jul1 = Date.parse("2026-07-01T00:00:00Z");
    expect(evaluateCondition(cond("after", jan1), { ts: jul1 })).toBe(true);
    expect(evaluateCondition(cond("before", jan1), { ts: jul1 })).toBe(false);
  });

  test("mixed ISO string attribute vs epoch value (and vice versa)", () => {
    const jan1 = Date.parse("2026-01-01T00:00:00Z");
    expect(evaluateCondition(cond("after", jan1), { ts: "2026-07-01T00:00:00Z" })).toBe(true);
    expect(evaluateCondition(cond("before", "2026-07-01T00:00:00Z"), { ts: jan1 })).toBe(true);
  });

  test("full ISO-8601 with timezone", () => {
    expect(
      evaluateCondition(cond("after", "2026-06-30T10:00:00Z"), { ts: "2026-06-30T12:00:00Z" }),
    ).toBe(true);
  });

  test("unparseable dates fail closed (false), never throw", () => {
    expect(evaluateCondition(cond("after", "not-a-date"), { ts: "2026-06-30" })).toBe(false);
    expect(evaluateCondition(cond("before", "2026-06-30"), { ts: "nope" })).toBe(false);
    expect(evaluateCondition(cond("after", "2026-01-01"), {})).toBe(false); // missing attribute
    expect(evaluateCondition(cond("before", "2026-01-01"), { ts: true })).toBe(false);
  });

  test("equal instants are neither before nor after", () => {
    expect(
      evaluateCondition(cond("before", "2026-06-30T00:00:00Z"), { ts: "2026-06-30T00:00:00Z" }),
    ).toBe(false);
    expect(
      evaluateCondition(cond("after", "2026-06-30T00:00:00Z"), { ts: "2026-06-30T00:00:00Z" }),
    ).toBe(false);
  });
});
