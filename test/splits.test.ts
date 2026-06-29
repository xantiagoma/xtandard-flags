import { describe, expect, test } from "vitest";
import { pickVariant } from "../src/evaluator.ts";

const split = (...legs: Array<[string, number]>) =>
  legs.map(([variant, weight]) => ({ variant, weight }));

describe("pickVariant — determinism", () => {
  test("same flag + same targetingKey + same salt → same variant", () => {
    const args = { flagKey: "theme", targetingKey: "user_42", split: split(["a", 50], ["b", 50]) };
    const first = pickVariant(args);
    for (let i = 0; i < 100; i++) expect(pickVariant(args)).toBe(first);
  });

  test("changing flag key changes buckets for some users", () => {
    let differences = 0;
    for (let i = 0; i < 1000; i++) {
      const tk = `user_${i}`;
      const a = pickVariant({
        flagKey: "flagA",
        targetingKey: tk,
        split: split(["x", 50], ["y", 50]),
      });
      const b = pickVariant({
        flagKey: "flagB",
        targetingKey: tk,
        split: split(["x", 50], ["y", 50]),
      });
      if (a !== b) differences++;
    }
    expect(differences).toBeGreaterThan(200);
  });

  test("changing salt changes buckets for some users", () => {
    let differences = 0;
    for (let i = 0; i < 1000; i++) {
      const tk = `user_${i}`;
      const a = pickVariant({
        flagKey: "f",
        targetingKey: tk,
        salt: "s1",
        split: split(["x", 50], ["y", 50]),
      });
      const b = pickVariant({
        flagKey: "f",
        targetingKey: tk,
        salt: "s2",
        split: split(["x", 50], ["y", 50]),
      });
      if (a !== b) differences++;
    }
    expect(differences).toBeGreaterThan(200);
  });
});

describe("pickVariant — distribution", () => {
  test("50/50 split is approximately even", () => {
    const counts: Record<string, number> = { a: 0, b: 0 };
    const N = 50000;
    for (let i = 0; i < N; i++) {
      const v = pickVariant({
        flagKey: "f",
        targetingKey: `u${i}`,
        split: split(["a", 50], ["b", 50]),
      })!;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    expect(Math.abs(counts.a! / N - 0.5)).toBeLessThan(0.02);
  });

  test("30/70 split respects weights", () => {
    const counts: Record<string, number> = { a: 0, b: 0 };
    const N = 50000;
    for (let i = 0; i < N; i++) {
      const v = pickVariant({
        flagKey: "f",
        targetingKey: `u${i}`,
        split: split(["a", 30], ["b", 70]),
      })!;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    expect(Math.abs(counts.a! / N - 0.3)).toBeLessThan(0.02);
  });

  test("weights need not total 100", () => {
    const counts: Record<string, number> = { a: 0, b: 0 };
    const N = 50000;
    for (let i = 0; i < N; i++) {
      const v = pickVariant({
        flagKey: "f",
        targetingKey: `u${i}`,
        split: split(["a", 1], ["b", 3]),
      })!;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    expect(Math.abs(counts.a! / N - 0.25)).toBeLessThan(0.02);
  });
});

describe("pickVariant — edge cases", () => {
  test("zero-weight legs receive no traffic", () => {
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 5000; i++) {
      const v = pickVariant({
        flagKey: "f",
        targetingKey: `u${i}`,
        split: split(["a", 0], ["b", 100]),
      })!;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    expect(counts.a).toBe(0);
    expect(counts.b).toBe(5000);
  });

  test("returns undefined when no positive-weight leg exists", () => {
    expect(
      pickVariant({ flagKey: "f", targetingKey: "u", split: split(["a", 0], ["b", 0]) }),
    ).toBeUndefined();
    expect(pickVariant({ flagKey: "f", targetingKey: "u", split: [] })).toBeUndefined();
  });
});
