import { afterEach, describe, expect, test } from "vitest";
import { createFlagsCore } from "../src/core.ts";
import { evaluateCondition } from "../src/evaluator.ts";
import {
  clearMatchers,
  regexMatcher,
  registerMatcher,
  resolveMatcher,
  withMatchers,
} from "../src/matchers.ts";
import type { MatcherFn, MatcherRegistry } from "../src/matchers.ts";
import { createOpenFeatureProvider } from "../src/openfeature.ts";
import type { Condition, JsonValue } from "../src/schema.ts";
import { siftMatcher } from "../src/sift-matcher.ts";
import { SnapshotStore } from "../src/snapshot.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, draft } from "./fixtures.ts";

const cond = (operator: Condition["operator"], value: unknown, extra: Partial<Condition> = {}) =>
  ({ attribute: "", operator, value: value as JsonValue, ...extra }) satisfies Condition;

// A tiny hand-rolled matcher: shallow key/value equality against the subject.
// Throws if the subject isn't an object, to exercise the fail-closed path.
const shallow: MatcherFn = (query, subject) => {
  if (subject === null || typeof subject !== "object") throw new TypeError("subject not an object");
  const subj = subject as Record<string, unknown>;
  return Object.entries(query as Record<string, unknown>).every(([k, val]) => subj[k] === val);
};

afterEach(() => {
  clearMatchers();
});

describe("registerMatcher + matches operator", () => {
  test("matches a JSON query against the whole context (empty attribute)", () => {
    registerMatcher("default", shallow);
    expect(evaluateCondition(cond("matches", { plan: "pro" }), { plan: "pro", seats: 3 })).toBe(
      true,
    );
    expect(evaluateCondition(cond("matches", { plan: "pro" }), { plan: "free" })).toBe(false);
  });

  test("notMatches is the clean negation", () => {
    registerMatcher("default", shallow);
    expect(evaluateCondition(cond("notMatches", { plan: "pro" }), { plan: "free" })).toBe(true);
    expect(evaluateCondition(cond("notMatches", { plan: "pro" }), { plan: "pro" })).toBe(false);
  });

  test("named matcher via condition.matcher", () => {
    registerMatcher("shallow", shallow);
    const c = cond("matches", { a: 1 }, { matcher: "shallow" });
    expect(evaluateCondition(c, { a: 1 })).toBe(true);
  });

  test("attribute scopes the subject to context[attribute]", () => {
    registerMatcher("default", shallow);
    const c = cond("matches", { city: "NYC" }, { attribute: "address" });
    expect(evaluateCondition(c, { address: { city: "NYC" } })).toBe(true);
    expect(evaluateCondition(c, { address: { city: "LA" } })).toBe(false);
  });
});

describe("fail-closed semantics (never throws)", () => {
  test("unregistered matcher → false for both matches and notMatches", () => {
    expect(evaluateCondition(cond("matches", { a: 1 }), { a: 1 })).toBe(false);
    expect(evaluateCondition(cond("notMatches", { a: 1 }), { a: 1 })).toBe(false);
  });

  test("an unknown named matcher → false", () => {
    registerMatcher("default", shallow);
    expect(evaluateCondition(cond("matches", { a: 1 }, { matcher: "nope" }), { a: 1 })).toBe(false);
  });

  test("a throwing matcher fails closed for both operators, no throw", () => {
    registerMatcher("default", shallow); // throws when subject isn't an object
    const c = cond("matches", { a: 1 }, { attribute: "x" });
    expect(() => evaluateCondition(c, { x: 5 })).not.toThrow();
    expect(evaluateCondition(c, { x: 5 })).toBe(false);
    expect(evaluateCondition(cond("notMatches", { a: 1 }, { attribute: "x" }), { x: 5 })).toBe(
      false,
    );
  });

  test("non-object query value → false (no matcher invoked)", () => {
    registerMatcher("default", shallow);
    expect(evaluateCondition(cond("matches", "not-a-query"), { a: 1 })).toBe(false);
    expect(evaluateCondition(cond("matches", [1, 2]), { a: 1 })).toBe(false);
    expect(evaluateCondition(cond("matches", undefined), { a: 1 })).toBe(false);
  });
});

describe("registry mechanics", () => {
  test("dispose removes the matcher; clear removes all", () => {
    const dispose = registerMatcher("default", shallow);
    expect(resolveMatcher("default")).toBe(shallow);
    dispose();
    expect(resolveMatcher("default")).toBeUndefined();
    registerMatcher("a", shallow);
    registerMatcher("b", shallow);
    clearMatchers();
    expect(resolveMatcher("a")).toBeUndefined();
  });

  test("re-registering a name replaces it", () => {
    const other: MatcherFn = () => true;
    registerMatcher("default", shallow);
    registerMatcher("default", other);
    expect(resolveMatcher("default")).toBe(other);
  });
});

describe("withMatchers — per-call scope over global", () => {
  test("applies only inside, restores after", () => {
    const reg: MatcherRegistry = new Map([["default", shallow]]);
    const expr = () => evaluateCondition(cond("matches", { a: 1 }), { a: 1 });
    expect(expr()).toBe(false);
    expect(withMatchers(reg, expr)).toBe(true);
    expect(expr()).toBe(false);
  });

  test("scoped matcher shadows a global one of the same name", () => {
    registerMatcher("default", () => false); // global: never matches
    const reg: MatcherRegistry = { default: shallow };
    expect(withMatchers(reg, () => evaluateCondition(cond("matches", { a: 1 }), { a: 1 }))).toBe(
      true,
    );
  });

  test("accepts Map, Record, and tuple-array shapes", () => {
    const expr = () => evaluateCondition(cond("matches", { a: 1 }), { a: 1 });
    expect(withMatchers(new Map([["default", shallow]]), expr)).toBe(true);
    expect(withMatchers({ default: shallow }, expr)).toBe(true);
    expect(withMatchers([["default", shallow]], expr)).toBe(true);
  });

  test("scope restored even when the body throws", () => {
    expect(() =>
      withMatchers({ default: shallow }, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(resolveMatcher("default")).toBeUndefined();
  });
});

describe("built-in regex matcher (zero-dep, always available)", () => {
  test('"regex" works with no registration and survives clearMatchers()', () => {
    clearMatchers();
    const c = cond(
      "matches",
      { pattern: "@example\\.com$", flags: "i" },
      {
        attribute: "email",
        matcher: "regex",
      },
    );
    expect(evaluateCondition(c, { email: "Sam@EXAMPLE.com" })).toBe(true);
    expect(evaluateCondition(c, { email: "sam@other.com" })).toBe(false);
    expect(resolveMatcher("regex")).toBe(regexMatcher);
  });

  test("notMatches with regex", () => {
    const c = cond("notMatches", { pattern: "^v\\d" }, { attribute: "tag", matcher: "regex" });
    expect(evaluateCondition(c, { tag: "stable" })).toBe(true);
    expect(evaluateCondition(c, { tag: "v2" })).toBe(false);
  });

  test("a malformed pattern fails closed", () => {
    const c = cond("matches", { pattern: "(" }, { attribute: "x", matcher: "regex" });
    expect(() => evaluateCondition(c, { x: "abc" })).not.toThrow();
    expect(evaluateCondition(c, { x: "abc" })).toBe(false);
  });

  test("a user-registered matcher shadows the built-in name", () => {
    registerMatcher("regex", () => true); // override
    const c = cond("matches", { pattern: "won't-match" }, { attribute: "x", matcher: "regex" });
    expect(evaluateCondition(c, { x: "abc" })).toBe(true);
  });
});

describe("sift adapter (@xtandard/flags/match/sift)", () => {
  test("MongoDB-style operators: $gt, $in, $or", () => {
    registerMatcher("default", siftMatcher);
    const ctx = { plan: "pro", seats: 12, role: "admin" };
    expect(evaluateCondition(cond("matches", { seats: { $gt: 10 } }), ctx)).toBe(true);
    expect(evaluateCondition(cond("matches", { plan: { $in: ["pro", "ent"] } }), ctx)).toBe(true);
    expect(
      evaluateCondition(
        cond("matches", { $or: [{ seats: { $gt: 100 } }, { role: "admin" }] }),
        ctx,
      ),
    ).toBe(true);
    expect(evaluateCondition(cond("matches", { seats: { $lt: 5 } }), ctx)).toBe(false);
  });

  test("nested sub-paths in the query", () => {
    registerMatcher("default", siftMatcher);
    expect(
      evaluateCondition(cond("matches", { "org.tier": "enterprise" }), {
        org: { tier: "enterprise" },
      }),
    ).toBe(true);
  });
});

// A flag whose rule fires only when a sift query matches the context.
const queryGatedFlag = () =>
  booleanFlag({
    rules: [
      {
        id: "power-users",
        conditions: [{ attribute: "", operator: "matches", value: { seats: { $gt: 10 } } }],
        serve: { variant: "on" },
      },
    ],
  });
const siftReg: MatcherRegistry = { default: siftMatcher };

describe("provider + core init option (matchers)", () => {
  test("provider.matchers makes the matches rule fire", async () => {
    const storage = createMemoryStorage();
    await new SnapshotStore(storage).publish(draft([queryGatedFlag()]));
    const provider = createOpenFeatureProvider({
      storage,
      refreshIntervalMs: 0,
      matchers: siftReg,
    });
    await provider.initialize();
    const hit = await provider.resolveBooleanEvaluation("new-dashboard", false, {
      targetingKey: "u1",
      seats: 25,
    });
    expect(hit.value).toBe(true);
    expect(hit.reason).toBe("TARGETING_MATCH");
    const miss = await provider.resolveBooleanEvaluation("new-dashboard", false, {
      targetingKey: "u2",
      seats: 3,
    });
    expect(miss.value).toBe(false);
    await provider.onClose();
  });

  test("without matchers the matches rule fails closed → fallthrough", async () => {
    const storage = createMemoryStorage();
    await new SnapshotStore(storage).publish(draft([queryGatedFlag()]));
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();
    const r = await provider.resolveBooleanEvaluation("new-dashboard", false, {
      targetingKey: "u1",
      seats: 25,
    });
    expect(r.value).toBe(false);
    await provider.onClose();
  });

  test("core.evaluate honours the instance matchers", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage(), matchers: siftReg });
    await core.upsertFlag(queryGatedFlag());
    const r = await core.evaluate({
      context: { targetingKey: "u1", seats: 25 },
      flagKey: "new-dashboard",
    });
    expect(r[0]).toMatchObject({ value: true, variant: "on", reason: "TARGETING_MATCH" });
  });
});
