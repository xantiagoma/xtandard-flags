import { describe, expect, test } from "vitest";
import { evaluateCondition } from "../src/evaluator.ts";
import type { Condition } from "../src/schema.ts";

const cond = (operator: Condition["operator"], value: unknown): Condition => ({
  attribute: "ts",
  operator,
  value: value as Condition["value"],
});

// Dates have no dedicated operators — they compare through the ordering operators
// (`>` / `<` / …), which coerce ISO-8601 strings, epoch-millis numbers, `Date`,
// and Temporal-like values via the comparable engine. See conditions-comparable.

describe("date comparison via ordering operators", () => {
  test("ISO string vs ISO string", () => {
    expect(evaluateCondition(cond("greaterThan", "2026-01-01"), { ts: "2026-06-30" })).toBe(true);
    expect(evaluateCondition(cond("lessThan", "2026-01-01"), { ts: "2026-06-30" })).toBe(false);
    expect(evaluateCondition(cond("lessThan", "2026-12-31"), { ts: "2026-06-30" })).toBe(true);
  });

  test("epoch-millis numbers", () => {
    const jan1 = Date.parse("2026-01-01T00:00:00Z");
    const jul1 = Date.parse("2026-07-01T00:00:00Z");
    expect(evaluateCondition(cond("greaterThan", jan1), { ts: jul1 })).toBe(true);
    expect(evaluateCondition(cond("lessThan", jan1), { ts: jul1 })).toBe(false);
  });

  test("mixed ISO string attribute vs epoch value (and vice versa)", () => {
    const jan1 = Date.parse("2026-01-01T00:00:00Z");
    expect(evaluateCondition(cond("greaterThan", jan1), { ts: "2026-07-01T00:00:00Z" })).toBe(true);
    expect(evaluateCondition(cond("lessThan", "2026-07-01T00:00:00Z"), { ts: jan1 })).toBe(true);
  });

  test("full ISO-8601 with timezone", () => {
    expect(
      evaluateCondition(cond("greaterThan", "2026-06-30T10:00:00Z"), {
        ts: "2026-06-30T12:00:00Z",
      }),
    ).toBe(true);
  });

  test("unparseable dates fail closed (false), never throw", () => {
    expect(evaluateCondition(cond("greaterThan", "not-a-date"), { ts: "2026-06-30" })).toBe(false);
    expect(evaluateCondition(cond("lessThan", "2026-06-30"), { ts: "nope" })).toBe(false);
    expect(evaluateCondition(cond("greaterThan", "2026-01-01"), {})).toBe(false); // missing attr
    expect(evaluateCondition(cond("lessThan", "2026-01-01"), { ts: true })).toBe(false);
  });

  test("equal instants are neither greater nor less", () => {
    expect(
      evaluateCondition(cond("lessThan", "2026-06-30T00:00:00Z"), { ts: "2026-06-30T00:00:00Z" }),
    ).toBe(false);
    expect(
      evaluateCondition(cond("greaterThan", "2026-06-30T00:00:00Z"), {
        ts: "2026-06-30T00:00:00Z",
      }),
    ).toBe(false);
  });

  test("inclusive variants (>= / <=) include the equal instant", () => {
    const t = "2026-06-30T00:00:00Z";
    expect(evaluateCondition(cond("greaterThanOrEqual", t), { ts: t })).toBe(true);
    expect(evaluateCondition(cond("lessThanOrEqual", t), { ts: t })).toBe(true);
  });
});

describe("comparable coercion — Date / Temporal-like / valueOf", () => {
  test("a real Date instance in the context (in-process) compares", () => {
    expect(
      evaluateCondition(cond("greaterThan", "2026-01-01"), { ts: new Date("2026-07-01") }),
    ).toBe(true);
    expect(evaluateCondition(cond("lessThan", "2026-01-01"), { ts: new Date("2026-07-01") })).toBe(
      false,
    );
  });

  test("a Temporal-like object (epochMilliseconds) compares", () => {
    const instant = { epochMilliseconds: Date.parse("2026-07-01T00:00:00Z") };
    expect(evaluateCondition(cond("greaterThan", "2026-01-01T00:00:00Z"), { ts: instant })).toBe(
      true,
    );
  });

  test("any object with a numeric valueOf is comparable (the standard JS hook)", () => {
    const comparable = { valueOf: () => 150 };
    expect(evaluateCondition(cond("greaterThan", 100), { ts: comparable })).toBe(true);
    expect(evaluateCondition(cond("lessThan", 100), { ts: comparable })).toBe(false);
  });

  test("numeric operators accept Dates and ISO strings", () => {
    expect(
      evaluateCondition(cond("greaterThan", "2026-01-01"), { ts: new Date("2026-07-01") }),
    ).toBe(true);
    expect(evaluateCondition(cond("lessThan", "2026-12-31"), { ts: "2026-06-30" })).toBe(true);
  });

  test("plain numbers/strings still take the numeric path (a year string is a number)", () => {
    expect(evaluateCondition(cond("greaterThan", 5), { ts: "10" })).toBe(true);
    expect(evaluateCondition(cond("greaterThan", "2000"), { ts: "2026" })).toBe(true);
  });

  test("an object whose valueOf throws fails closed (no throw)", () => {
    const bad = {
      valueOf() {
        throw new Error("nope");
      },
    };
    expect(() => evaluateCondition(cond("greaterThan", 1), { ts: bad })).not.toThrow();
    expect(evaluateCondition(cond("greaterThan", 1), { ts: bad })).toBe(false);
  });
});
