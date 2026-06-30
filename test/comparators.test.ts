import { afterEach, describe, expect, test } from "vitest";
import { clearComparators, registerComparator, withComparators } from "../src/comparators.ts";
import type { ComparatorRegistry } from "../src/comparators.ts";
import { createFlagsCore } from "../src/core.ts";
import { evaluateCondition } from "../src/evaluator.ts";
import { createOpenFeatureProvider } from "../src/openfeature.ts";
import type { Condition, JsonValue } from "../src/schema.ts";
import { SnapshotStore } from "../src/snapshot.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, draft } from "./fixtures.ts";

const cond = (operator: Condition["operator"], value: unknown): Condition => ({
  attribute: "v",
  operator,
  value: value as Condition["value"],
});

// A Dinero-style value object that does NOT follow the static-compare/static-from
// convention: a factory function, comparison via free functions. This is exactly
// the gap the registry fills — constructor duck-typing can't see a static compare.
interface Money {
  amount: number;
  currency: { code: string };
  scale: number;
}
const money = (amount: number, code = "USD", scale = 2): Money => ({
  amount,
  currency: { code },
  scale,
});
const isMoney = (v: unknown): boolean =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Money).amount === "number" &&
  typeof (v as Money).currency?.code === "string" &&
  typeof (v as Money).scale === "number";
// Compare normalised to the same scale; throws on currency mismatch (→ fail closed).
const moneyCompare = (a: unknown, b: unknown): number => {
  const x = a as Money;
  const y = b as Money;
  if (x.currency.code !== y.currency.code) throw new Error("currency mismatch");
  const norm = (m: Money, scale: number) => m.amount * 10 ** (scale - m.scale);
  const scale = Math.max(x.scale, y.scale);
  return norm(x, scale) - norm(y, scale);
};
// Parse a JSON-stored money value (the condition's `expected`) back into Money.
const moneyParse = (raw: unknown): Money => {
  if (isMoney(raw)) return raw as Money;
  throw new Error("not money");
};

afterEach(() => {
  clearComparators();
});

describe("registerComparator — global default registry", () => {
  test("orders a custom value object the duck-typing can't (no static compare)", () => {
    registerComparator(isMoney, { compare: moneyCompare });
    const ctx = { v: money(1500) }; // $15.00
    expect(evaluateCondition(cond("greaterThan", money(1000)), ctx)).toBe(true);
    expect(evaluateCondition(cond("lessThan", money(2000)), ctx)).toBe(true);
    expect(evaluateCondition(cond("greaterThan", money(2000)), ctx)).toBe(false);
  });

  test("equality goes through the comparator too (compareValues === 0)", () => {
    registerComparator(isMoney, { compare: moneyCompare });
    expect(evaluateCondition(cond("equals", money(1500)), { v: money(1500) })).toBe(true);
    expect(evaluateCondition(cond("notEquals", money(99)), { v: money(1500) })).toBe(true);
    // Different scale, same real value: $15.00 (scale 2) === 150 (scale 1).
    expect(evaluateCondition(cond("equals", money(150, "USD", 1)), { v: money(1500) })).toBe(true);
  });

  test("before/after delegate to the comparator", () => {
    registerComparator(isMoney, { compare: moneyCompare });
    expect(evaluateCondition(cond("after", money(1000)), { v: money(1500) })).toBe(true);
    expect(evaluateCondition(cond("before", money(1000)), { v: money(1500) })).toBe(false);
  });

  test("`in` works with custom value objects", () => {
    registerComparator(isMoney, { compare: moneyCompare });
    const ctx = { v: money(1500) };
    expect(evaluateCondition(cond("in", [money(100), money(1500)]), ctx)).toBe(true);
    expect(evaluateCondition(cond("in", [money(100), money(200)]), ctx)).toBe(false);
  });
});

describe("parser lifts the JSON-stored operand into the comparable type", () => {
  test("context Money vs a plain-JSON threshold parsed back into Money", () => {
    registerComparator(isMoney, { compare: moneyCompare, parser: moneyParse });
    // The stored `expected` is a plain object after a JSON round-trip — still
    // matches isMoney here, but parser proves the lift path is exercised.
    const stored = JSON.parse(JSON.stringify(money(1000))) as unknown;
    expect(evaluateCondition(cond("greaterThan", stored), { v: money(1500) })).toBe(true);
  });
});

describe("fail-closed semantics (never throws)", () => {
  test("a comparator that throws fails the condition closed, no fall-through", () => {
    registerComparator(isMoney, { compare: moneyCompare });
    const ctx = { v: money(1500, "USD") };
    // Currency mismatch makes moneyCompare throw → condition is false, not an error.
    expect(() => evaluateCondition(cond("greaterThan", money(100, "EUR")), ctx)).not.toThrow();
    expect(evaluateCondition(cond("greaterThan", money(100, "EUR")), ctx)).toBe(false);
  });

  test("a predicate that throws is treated as non-matching", () => {
    const explosive = (v: unknown): boolean => {
      // Accesses a property unsafely; throws on a primitive.
      return (v as { currency: { code: string } }).currency.code === "USD";
    };
    registerComparator(explosive, { compare: () => 0 });
    // A primitive operand makes the predicate throw; we must not propagate, and
    // must fall through to ordinary numeric comparison.
    expect(() => evaluateCondition(cond("greaterThan", 1), { v: 5 })).not.toThrow();
    expect(evaluateCondition(cond("greaterThan", 1), { v: 5 })).toBe(true);
  });
});

describe("no regression when nothing matches", () => {
  test("registered comparator is ignored for unrelated values", () => {
    registerComparator(isMoney, { compare: moneyCompare });
    // Plain numbers still use the numeric tier.
    expect(evaluateCondition(cond("greaterThan", 10), { v: 20 })).toBe(true);
    expect(evaluateCondition(cond("lessThan", 10), { v: 5 })).toBe(true);
    // ISO date strings still compare numerically.
    expect(evaluateCondition(cond("after", "2026-01-01"), { v: "2026-07-01" })).toBe(true);
  });
});

describe("unregister + clear", () => {
  test("the returned dispose function removes the comparator", () => {
    const dispose = registerComparator(isMoney, { compare: moneyCompare });
    expect(evaluateCondition(cond("greaterThan", money(100)), { v: money(200) })).toBe(true);
    dispose();
    // Without the comparator, two Money objects are plain objects → not comparable.
    expect(evaluateCondition(cond("greaterThan", money(100)), { v: money(200) })).toBe(false);
  });
});

describe("withComparators — per-instance scope over the global default", () => {
  test("scoped registry applies only inside the call", () => {
    const registry: ComparatorRegistry = new Map([[isMoney, { compare: moneyCompare }]]);
    const expr = () => evaluateCondition(cond("greaterThan", money(100)), { v: money(200) });
    expect(expr()).toBe(false); // not registered globally
    expect(withComparators(registry, expr)).toBe(true); // applies inside
    expect(expr()).toBe(false); // restored after
  });

  test("scoped entries take precedence over a global one for the same type", () => {
    // Global comparator inverts the order; scoped one is correct.
    registerComparator(isMoney, { compare: (a, b) => -moneyCompare(a, b) });
    const correct: ComparatorRegistry = [[isMoney, { compare: moneyCompare }]];
    const ctx = { v: money(200) };
    expect(evaluateCondition(cond("greaterThan", money(100)), ctx)).toBe(false); // inverted global
    expect(
      withComparators(correct, () => evaluateCondition(cond("greaterThan", money(100)), ctx)),
    ).toBe(true); // scoped wins
  });

  test("accepts both a Map and an array of tuples", () => {
    const asArray: ComparatorRegistry = [[isMoney, { compare: moneyCompare }]];
    const asMap: ComparatorRegistry = new Map([[isMoney, { compare: moneyCompare }]]);
    const expr = () => evaluateCondition(cond("equals", money(1500)), { v: money(1500) });
    expect(withComparators(asArray, expr)).toBe(true);
    expect(withComparators(asMap, expr)).toBe(true);
  });

  test("undefined registry is a no-op passthrough", () => {
    expect(withComparators(undefined, () => 42)).toBe(42);
  });

  test("scope is restored even when the body throws", () => {
    const registry: ComparatorRegistry = [[isMoney, { compare: moneyCompare }]];
    expect(() =>
      withComparators(registry, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    // Global registry is untouched afterwards.
    expect(evaluateCondition(cond("greaterThan", money(100)), { v: money(200) })).toBe(false);
  });
});

// Money is structurally JSON but lacks the index signature JsonValue /
// EvaluationContext nominally require; cast at the fixture boundary.
const json = (m: Money): JsonValue => m as unknown as JsonValue;

// A flag whose targeting rule compares a Money context attribute against a
// JSON-stored Money threshold. The rule only matches if a comparator is wired.
const moneyGatedFlag = () =>
  booleanFlag({
    rules: [
      {
        id: "high-value",
        conditions: [{ attribute: "price", operator: "greaterThan", value: json(money(1000)) }],
        serve: { variant: "on" },
      },
    ],
  });
const richRegistry: ComparatorRegistry = [[isMoney, { compare: moneyCompare }]];

describe("OpenFeatureProviderOptions.comparators (init override)", () => {
  test("the provider's comparators make a custom-type rule match", async () => {
    const storage = createMemoryStorage();
    await new SnapshotStore(storage).publish(draft([moneyGatedFlag()]));

    const provider = createOpenFeatureProvider({
      storage,
      refreshIntervalMs: 0,
      comparators: richRegistry,
    });
    await provider.initialize();
    const hit = await provider.resolveBooleanEvaluation("new-dashboard", false, {
      targetingKey: "u1",
      price: json(money(1500)),
    });
    expect(hit.value).toBe(true);
    expect(hit.reason).toBe("TARGETING_MATCH");
    await provider.onClose();
  });

  test("without comparators the same rule fails closed → fallthrough", async () => {
    const storage = createMemoryStorage();
    await new SnapshotStore(storage).publish(draft([moneyGatedFlag()]));

    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();
    const miss = await provider.resolveBooleanEvaluation("new-dashboard", false, {
      targetingKey: "u1",
      price: json(money(1500)),
    });
    expect(miss.value).toBe(false); // two plain objects aren't comparable → rule skipped
    await provider.onClose();
  });
});

describe("FlagsCoreOptions.comparators (test-targeting override)", () => {
  test("core.evaluate honours the instance comparators", async () => {
    const core = createFlagsCore({
      sourceStorage: createMemoryStorage(),
      comparators: richRegistry,
    });
    await core.upsertFlag(moneyGatedFlag());
    const r = await core.evaluate({
      context: { targetingKey: "u1", price: money(1500) },
      flagKey: "new-dashboard",
    });
    expect(r[0]).toMatchObject({ value: true, variant: "on", reason: "TARGETING_MATCH" });
  });
});
