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

// A value object following the same convention Temporal uses: static `from`
// (parse) + static `compare`. The evaluator finds this via the instance's
// constructor — no globalThis/Temporal lookup, no hardcoded type list. This is
// the *exact* code path real `Temporal.PlainDate`/`Duration`/etc. take.
class Dur {
  constructor(readonly ms: number) {}
  static from(v: unknown): Dur {
    if (typeof v === "string") {
      const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(v);
      if (!m) throw new RangeError("bad duration");
      return new Dur((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000);
    }
    if (v instanceof Dur) return v;
    throw new TypeError("unsupported");
  }
  static compare(a: Dur, b: Dur): number {
    return a.ms - b.ms;
  }
}

// A value object with NO static compare — should fall through to numeric valueOf.
class Money {
  constructor(readonly cents: number) {}
  valueOf(): number {
    return this.cents;
  }
}

describe("comparable — value objects via constructor.compare + from", () => {
  test("instance vs stored string threshold (parsed with static from)", () => {
    const ctx = { v: Dur.from("PT50M") }; // 50 minutes
    expect(evaluateCondition(cond("lessThan", "PT1H"), ctx)).toBe(true);
    expect(evaluateCondition(cond("before", "PT1H"), ctx)).toBe(true);
    expect(evaluateCondition(cond("greaterThan", "PT2H"), ctx)).toBe(false);
  });

  test("instance vs instance", () => {
    expect(evaluateCondition(cond("after", new Dur(60_000)), { v: new Dur(120_000) })).toBe(true);
  });

  test("unparseable threshold for the type fails closed (no throw)", () => {
    const ctx = { v: Dur.from("PT1H") };
    expect(() => evaluateCondition(cond("after", "garbage"), ctx)).not.toThrow();
    expect(evaluateCondition(cond("after", "garbage"), ctx)).toBe(false);
  });

  test("a value object without static compare falls back to valueOf (numeric)", () => {
    expect(evaluateCondition(cond("greaterThan", 100), { v: new Money(150) })).toBe(true);
    expect(evaluateCondition(cond("lessThan", 100), { v: new Money(50) })).toBe(true);
  });

  test("plain objects/arrays are not comparable → false", () => {
    expect(evaluateCondition(cond("greaterThan", 1), { v: {} })).toBe(false);
    expect(evaluateCondition(cond("greaterThan", 1), { v: [1, 2] })).toBe(false);
  });

  test("ISO strings still compare numerically when no instance is involved", () => {
    expect(evaluateCondition(cond("after", "2026-01-01"), { v: "2026-07-01" })).toBe(true);
  });
});

describe("equality understands value objects & bigint (compareValues === 0)", () => {
  test("bigint equals its number magnitude", () => {
    expect(evaluateCondition(cond("equals", 5), { v: 5n })).toBe(true);
    expect(evaluateCondition(cond("notEquals", 6), { v: 5n })).toBe(true);
  });

  test('a value object equals via static compare (Dur 1h === "PT1H")', () => {
    expect(evaluateCondition(cond("equals", "PT1H"), { v: Dur.from("PT1H") })).toBe(true);
    expect(evaluateCondition(cond("equals", "PT2H"), { v: Dur.from("PT1H") })).toBe(false);
  });

  test("a valueOf object equals its numeric value", () => {
    expect(evaluateCondition(cond("equals", 150), { v: new Money(150) })).toBe(true);
  });

  test("`in` works with value objects", () => {
    const ctx = { v: Dur.from("PT2H") };
    expect(evaluateCondition(cond("in", ["PT1H", "PT2H"]), ctx)).toBe(true);
    expect(evaluateCondition(cond("in", ["PT1H", "PT30M"]), ctx)).toBe(false);
  });

  test("primitive equality is unchanged (string-loose, not numeric)", () => {
    // "1" equals "1.0" must stay false — we don't numerically coerce primitives.
    expect(evaluateCondition(cond("equals", "1.0"), { v: "1" })).toBe(false);
    expect(evaluateCondition(cond("equals", "1"), { v: 1 })).toBe(true); // loose across primitives
  });
});
