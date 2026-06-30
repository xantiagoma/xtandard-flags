import { describe, expect, test } from "vitest";
import { evaluateCondition } from "../src/evaluator.ts";
import type { Condition } from "../src/schema.ts";

const cond = (operator: Condition["operator"], value: unknown): Condition => ({
  attribute: "v",
  operator,
  value: value as Condition["value"],
});

describe("comparable — BigInt", () => {
  test("exact bigint ordering (beyond Number precision)", () => {
    const big = 9007199254740993n; // 2^53 + 1, not representable as a double
    const bigger = 9007199254740994n;
    expect(evaluateCondition(cond("greaterThan", big), { v: bigger })).toBe(true);
    expect(evaluateCondition(cond("lessThan", bigger), { v: big })).toBe(true);
    expect(evaluateCondition(cond("greaterThan", bigger), { v: big })).toBe(false);
  });

  test("mixed bigint / number compares by magnitude", () => {
    expect(evaluateCondition(cond("greaterThan", 100), { v: 150n })).toBe(true);
    expect(evaluateCondition(cond("lessThan", 100), { v: 50n })).toBe(true);
    expect(evaluateCondition(cond("after", 1000), { v: 2000n })).toBe(true);
  });
});

// Mock the Temporal global to verify our dispatch (Bun has no native Temporal yet).
// A faux PlainDate with the same static `from`/`compare` surface the evaluator uses.
class FakePlainDate {
  constructor(readonly ms: number) {}
  static from(s: unknown): FakePlainDate {
    if (typeof s !== "string") throw new TypeError("not a date string");
    const t = Date.parse(s);
    if (Number.isNaN(t)) throw new RangeError("bad date");
    return new FakePlainDate(t);
  }
  static compare(a: FakePlainDate, b: FakePlainDate): number {
    return a.ms - b.ms;
  }
}

function withTemporal(temporal: unknown, fn: () => void): void {
  const g = globalThis as { Temporal?: unknown };
  const prev = g.Temporal;
  g.Temporal = temporal;
  try {
    fn();
  } finally {
    if (prev === undefined) delete g.Temporal;
    else g.Temporal = prev;
  }
}

describe("comparable — Temporal (mocked) via static from/compare", () => {
  test("a Temporal instance compares against a stored ISO string", () => {
    withTemporal({ PlainDate: FakePlainDate }, () => {
      const ctx = { v: FakePlainDate.from("2026-07-01") };
      expect(evaluateCondition(cond("after", "2026-01-01"), ctx)).toBe(true);
      expect(evaluateCondition(cond("before", "2026-01-01"), ctx)).toBe(false);
      expect(evaluateCondition(cond("greaterThan", "2026-12-31"), ctx)).toBe(false);
    });
  });

  test("two Temporal instances compare directly", () => {
    withTemporal({ PlainDate: FakePlainDate }, () => {
      const ctx = { v: FakePlainDate.from("2026-07-01") };
      expect(evaluateCondition(cond("after", FakePlainDate.from("2026-06-30")), ctx)).toBe(true);
    });
  });

  test("an unparseable threshold for a Temporal type fails closed", () => {
    withTemporal({ PlainDate: FakePlainDate }, () => {
      const ctx = { v: FakePlainDate.from("2026-07-01") };
      expect(evaluateCondition(cond("after", "not-a-date"), ctx)).toBe(false);
    });
  });

  test("without Temporal, ISO strings still compare numerically (no regression)", () => {
    expect(evaluateCondition(cond("after", "2026-01-01"), { v: "2026-07-01" })).toBe(true);
  });
});
