/**
 * The flag evaluator — the heart of the runtime. Pure, synchronous, zero deps.
 *
 * Implements the evaluation order from the spec:
 *
 * 1. Flag disabled        → default variant value (reason `DISABLED`)
 * 2. Prerequisites unmet  → default variant value (reason `PREREQUISITE_FAILED`)
 * 3. Exact overrides      → match on bucketing key (reason `STATIC`)
 * 4. Targeting rules      → first matching rule wins (reason `TARGETING_MATCH` / `SPLIT`)
 * 5. Fallthrough          → fixed variant or deterministic split (reason `STATIC` / `SPLIT`)
 * 6. Invalid config       → no value (reason `ERROR`)
 *
 * Prerequisites re-evaluate other flags from a passed-in flag map; the dependency
 * graph is validated acyclic at publish time.
 *
 * "Flag missing" (reason `FLAG_NOT_FOUND`) is handled one level up by the
 * provider, which holds the caller's default value.
 *
 * @module
 */

import { compareViaComparators } from "./comparators.ts";
import { hashToUnitInterval } from "./hash.ts";
import { DEFAULT_MATCHER, resolveMatcher } from "./matchers.ts";
import { tryCatchSync } from "./try-catch.ts";
import type {
  Condition,
  ConditionOperator,
  EvaluationContext,
  EvaluationReason,
  Flag,
  FlagErrorCode,
  FlagValue,
  Segment,
  Serve,
  SplitEntry,
} from "./schema.ts";

/** Resolved segments embedded in a snapshot, keyed by segment key. */
export type SegmentMap = Record<string, Segment>;

/**
 * Whether the context satisfies a segment (AND of its conditions). `seen` guards
 * against cyclic `notInSegment` references — a segment already on the stack is
 * treated as non-matching rather than recursing forever.
 */
function matchesSegment(
  key: string,
  context: EvaluationContext,
  segments: SegmentMap,
  seen: Set<string>,
): boolean {
  if (seen.has(key)) return false;
  const segment = segments[key];
  if (!segment) return false;
  const next = new Set(seen).add(key);
  return segment.conditions.every((c) => evaluateCondition(c, context, segments, next));
}

/** The segment key(s) a condition value names: a single key string, or an array (OR). */
function segmentKeys(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && !!v);
  return [];
}

/** Whether the context is a member of **any** of the named segments (OR). */
function inAnySegment(
  value: unknown,
  context: EvaluationContext,
  segments: SegmentMap,
  seen: Set<string>,
): boolean {
  return segmentKeys(value).some((key) => matchesSegment(key, context, segments, seen));
}

/** The outcome of evaluating a single flag. `value` is `undefined` only on ERROR. */
export interface FlagEvaluation {
  value: FlagValue | undefined;
  variant: string | undefined;
  reason: EvaluationReason;
  errorCode?: FlagErrorCode;
  errorMessage?: string;
}

/**
 * Attributes consulted (in order) to derive a deterministic bucketing key when
 * `targetingKey` is absent.
 */
const BUCKETING_FALLBACK_ATTRS = ["userId", "organizationId", "email", "sessionId"] as const;

/**
 * Resolve the bucketing key for splits from the evaluation context.
 *
 * @example
 * ```ts
 * import { resolveBucketingKey } from "@xtandard/flags";
 *
 * const key = resolveBucketingKey({ targetingKey: "user-42" });
 * // → "user-42"
 *
 * const fallback = resolveBucketingKey({ userId: "u99" });
 * // → "u99"  (falls back to userId when targetingKey is absent)
 * ```
 */
export function resolveBucketingKey(context: EvaluationContext): string | undefined {
  if (typeof context.targetingKey === "string" && context.targetingKey.length > 0) {
    return context.targetingKey;
  }
  for (const attr of BUCKETING_FALLBACK_ATTRS) {
    const v = context[attr];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

const isPrimitive = (v: unknown): v is string | number | boolean =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** Predictable equality: strict for same-type primitives, string-coerced across primitive types. */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isPrimitive(a) && isPrimitive(b)) return String(a) === String(b);
  return false;
}

/**
 * Equality used by `equals`/`notEquals`/`in`/`notIn`/`contains`. Primitives keep
 * the string-loose semantics of {@link looseEquals}; when a side is a **value
 * object** (Temporal, a `valueOf`-able type, …) or a **bigint**, fall back to
 * {@link compareValues} `=== 0` so e.g. a `Temporal.PlainDate` equals its ISO
 * string and `5n` equals `5`.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (looseEquals(a, b)) return true;
  const rich = (v: unknown) => typeof v === "bigint" || (v !== null && typeof v === "object");
  if (rich(a) || rich(b)) {
    const c = compareValues(a, b);
    if (c !== undefined) return c === 0;
  }
  return false;
}

/**
 * Coerce a value to a **comparable scalar number**. The numeric tier of
 * {@link compareValues}; handles numbers, numeric strings, ISO-8601 date strings
 * (→ epoch ms), `Date`, anything with a numeric `valueOf`/`Symbol.toPrimitive`,
 * and `bigint` (via `Number`). Returns `undefined` if it can't. Never throws.
 */
function toComparable(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return undefined;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(s);
    return Number.isNaN(t) ? undefined : t;
  }
  if (v === null || typeof v !== "object") return undefined;
  const epochMs = (v as { epochMilliseconds?: unknown }).epochMilliseconds;
  if (typeof epochMs === "number" && Number.isFinite(epochMs)) return epochMs;
  // Number(v) invokes Symbol.toPrimitive / valueOf (Date → ms, custom Comparable);
  // it can throw (e.g. Temporal types) — fail closed.
  const [n] = tryCatchSync(() => Number(v));
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

// Static "parse" method names tried (in order) to coerce the other side to a
// class's type, then the constructor itself (`new Klass(v)`, then `Klass(v)`) as a
// fallback. `from` covers Temporal and most modern value-object libraries.
const PARSE_STATICS = ["from", "fromString", "fromJSON", "parse"] as const;

/** Coerce `v` to an instance of `Klass`: static parser → `new Klass(v)` → `Klass(v)`. */
function coerceToType(Klass: Record<string, unknown>, v: unknown): unknown {
  const parse = PARSE_STATICS.map((m) => Klass[m]).find((f) => typeof f === "function") as
    | ((value: unknown) => unknown)
    | undefined;
  if (parse) return parse.call(Klass, v);
  const [built, err] = tryCatchSync(() => new (Klass as unknown as new (x: unknown) => unknown)(v));
  return err ? (Klass as unknown as (x: unknown) => unknown)(v) : built;
}

/**
 * Compare `x` (an object instance) against `other` using **x's own class statics**,
 * duck-typed via its constructor: if `x.constructor` exposes a static `compare(a,b)`
 * and a static parser (`from`/`fromString`/`fromJSON`/`parse`), parse `other` to the
 * same type and compare. Returns `-1|0|1` for `compare(x, other)`, or `undefined`.
 *
 * This needs no `globalThis.Temporal` and no hardcoded type list — it works for the
 * whole Temporal family (`PlainDate`, `Duration`, …) and any custom Comparable that
 * follows the same convention. Never throws.
 */
function compareViaConstructor(x: unknown, other: unknown): number | undefined {
  if (x === null || typeof x !== "object") return undefined;
  const Klass = (x as { constructor?: unknown }).constructor as
    | (((new (...a: never[]) => object) & {
        compare?: (a: unknown, b: unknown) => number;
      }) &
        Record<string, unknown>)
    | undefined;
  if (typeof Klass !== "function" || typeof Klass.compare !== "function") return undefined;
  const [c] = tryCatchSync(() => {
    const rhs =
      other instanceof Klass ? other : coerceToType(Klass as Record<string, unknown>, other);
    return Klass.compare!(x, rhs);
  });
  return typeof c === "number" && Number.isFinite(c) ? Math.sign(c) : undefined;
}

/**
 * Order two values for the comparison operators, returning `-1|0|1`, or
 * `undefined` when they aren't comparable (→ the condition fails closed). Tiers:
 *  0. **Registered comparators** — a {@link ./comparators.registerComparator}
 *     predicate matches a side ({@link compareViaComparators}); for value-object
 *     types that don't follow the static-`compare` convention (Dinero, Decimal,
 *     …). Takes precedence: an explicit registration is an explicit opt-in, and a
 *     matched-but-failing comparator fails closed rather than falling through.
 *  1. **Value-object compare** — a side's `constructor.compare` + a static parser
 *     ({@link compareViaConstructor}); covers the whole Temporal family
 *     (`PlainDate`/`PlainTime`/`Duration`/…) and any custom Comparable, with no
 *     `globalThis` dependency.
 *  2. **BigInt** — exact `bigint` ordering (mixed `bigint`/number is allowed by JS).
 *  3. **Numeric scalar** — {@link toComparable} (number, numeric/ISO string, `Date`,
 *     `valueOf`/`Symbol.toPrimitive`).
 */
function compareValues(a: unknown, b: unknown): number | undefined {
  // 0. Registered comparators win: a matched predicate owns the comparison
  // (an unmatched registry returns matched:false and we fall through).
  const viaRegistry = compareViaComparators(a, b);
  if (viaRegistry.matched) return viaRegistry.order;

  // Try a's class, then b's (inverting the sign since that compares b-vs-a).
  const direct = compareViaConstructor(a, b);
  if (direct !== undefined) return direct;
  const reverse = compareViaConstructor(b, a);
  if (reverse !== undefined) return reverse === 0 ? 0 : (-reverse as -1 | 1);

  if (typeof a === "bigint" || typeof b === "bigint") {
    const av = typeof a === "bigint" ? a : toComparable(a);
    const bv = typeof b === "bigint" ? b : toComparable(b);
    if (av === undefined || bv === undefined) return undefined;
    return av < bv ? -1 : av > bv ? 1 : 0;
  }

  const an = toComparable(a);
  const bn = toComparable(b);
  if (an === undefined || bn === undefined) return undefined;
  return an < bn ? -1 : an > bn ? 1 : 0;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseSemver(v: unknown): Semver | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim());
  if (!m) return undefined;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".") : [],
  };
}

/** Compare two semver strings. Returns -1, 0, 1, or `undefined` if either is invalid. */
export function compareSemver(a: unknown, b: unknown): number | undefined {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return undefined;
  if (x.major !== y.major) return x.major < y.major ? -1 : 1;
  if (x.minor !== y.minor) return x.minor < y.minor ? -1 : 1;
  if (x.patch !== y.patch) return x.patch < y.patch ? -1 : 1;
  // A version with a prerelease has lower precedence than one without.
  if (x.prerelease.length === 0 && y.prerelease.length === 0) return 0;
  if (x.prerelease.length === 0) return 1;
  if (y.prerelease.length === 0) return -1;
  const len = Math.max(x.prerelease.length, y.prerelease.length);
  for (let i = 0; i < len; i++) {
    const xi = x.prerelease[i];
    const yi = y.prerelease[i];
    if (xi === undefined) return -1;
    if (yi === undefined) return 1;
    const xn = /^\d+$/.test(xi);
    const yn = /^\d+$/.test(yi);
    if (xn && yn) {
      const d = Number(xi) - Number(yi);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1; // numeric identifiers have lower precedence than alphanumeric
    } else if (xi !== yi) {
      return xi < yi ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Evaluate a single condition operator against a context attribute value.
 *
 * @example
 * ```ts
 * import { evaluateCondition } from "@xtandard/flags";
 *
 * const matched = evaluateCondition(
 *   { attribute: "plan", operator: "in", value: ["pro", "enterprise"] },
 *   { plan: "pro" },
 * );
 * // → true
 * ```
 */
export function evaluateCondition(
  condition: Condition,
  context: EvaluationContext,
  segments: SegmentMap = {},
  seen: Set<string> = new Set(),
): boolean {
  const actual = context[condition.attribute];
  const expected = condition.value;
  const op: ConditionOperator = condition.operator;

  switch (op) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "notExists":
      return actual === undefined || actual === null;
    case "equals":
      return valuesEqual(actual, expected);
    case "notEquals":
      return !valuesEqual(actual, expected);
    case "in":
      return Array.isArray(expected) && expected.some((e) => valuesEqual(e, actual));
    case "notIn":
      return !(Array.isArray(expected) && expected.some((e) => valuesEqual(e, actual)));
    case "contains":
      if (Array.isArray(actual)) return actual.some((e) => valuesEqual(e, expected));
      return String(actual).includes(String(expected));
    case "notContains":
      if (Array.isArray(actual)) return !actual.some((e) => valuesEqual(e, expected));
      return !String(actual).includes(String(expected));
    case "startsWith":
      return typeof actual === "string" && actual.startsWith(String(expected));
    case "endsWith":
      return typeof actual === "string" && actual.endsWith(String(expected));
    case "greaterThan":
    case "greaterThanOrEqual":
    case "lessThan":
    case "lessThanOrEqual": {
      const c = compareValues(actual, expected);
      if (c === undefined) return false;
      if (op === "greaterThan") return c > 0;
      if (op === "greaterThanOrEqual") return c >= 0;
      if (op === "lessThan") return c < 0;
      return c <= 0;
    }
    case "semverEquals":
    case "semverGreaterThan":
    case "semverLessThan": {
      const cmp = compareSemver(actual, expected);
      if (cmp === undefined) return false;
      if (op === "semverEquals") return cmp === 0;
      if (op === "semverGreaterThan") return cmp > 0;
      return cmp < 0;
    }
    case "inSegment":
      // Single-key form is normally inlined at compile time; an array (OR) form
      // and any embedded snapshot resolve here. Member of ANY listed segment.
      return inAnySegment(expected, context, segments, seen);
    case "notInSegment":
      // Negated membership — true unless the context is in ANY listed segment
      // (i.e. a member of NONE of them).
      return !inAnySegment(expected, context, segments, seen);
    case "matches":
    case "notMatches": {
      // A registered matcher evaluates a JSON query against the subject
      // (`context[attribute]` when named, else the whole context). Any inability
      // to get a clean boolean — unregistered matcher, missing query, or a thrown
      // query — fails the condition closed for BOTH operators (the rule never
      // fires on a broken/absent matcher rather than guessing).
      if (expected === null || typeof expected !== "object") return false;
      const matcher = resolveMatcher(condition.matcher ?? DEFAULT_MATCHER);
      if (!matcher) return false;
      const subject = condition.attribute ? actual : context;
      const [ok, err] = tryCatchSync(() => matcher(expected, subject, context));
      if (err || typeof ok !== "boolean") return false;
      return op === "matches" ? ok : !ok;
    }
    default: {
      // Exhaustiveness guard: unknown operators never match.
      const _never: never = op;
      void _never;
      return false;
    }
  }
}

/** All conditions must pass (logical AND). An empty condition list always matches. */
export function matchesRule(
  conditions: Condition[],
  context: EvaluationContext,
  segments: SegmentMap = {},
): boolean {
  return conditions.every((c) => evaluateCondition(c, context, segments));
}

/** Input to {@link pickVariant}. */
export interface SplitInput {
  flagKey: string;
  targetingKey: string;
  salt?: string;
  split: SplitEntry[];
}

/**
 * Deterministically choose a variant from a weighted split.
 *
 * Invariant: same `flagKey` + same `targetingKey` + same `salt` → same variant.
 * Non-positive weights are ignored. Weights need not sum to 100. Returns
 * `undefined` if no positive-weight leg exists.
 *
 * @example
 * ```ts
 * import { pickVariant } from "@xtandard/flags";
 *
 * const variant = pickVariant({
 *   flagKey: "checkout-redesign",
 *   targetingKey: "user-42",
 *   split: [
 *     { variant: "control", weight: 50 },
 *     { variant: "treatment", weight: 50 },
 *   ],
 * });
 * // → deterministic: "control" or "treatment" based on hash of user-42
 * ```
 */
export function pickVariant(input: SplitInput): string | undefined {
  const legs = input.split.filter((s) => s.weight > 0);
  if (legs.length === 0) return undefined;
  const total = legs.reduce((sum, s) => sum + s.weight, 0);
  const hashInput = `${input.salt ?? ""}:${input.flagKey}:${input.targetingKey}`;
  const bucket = hashToUnitInterval(hashInput) * total;
  let cumulative = 0;
  for (const leg of legs) {
    cumulative += leg.weight;
    if (bucket < cumulative) return leg.variant;
  }
  return legs[legs.length - 1]!.variant;
}

/** Look up a variant's value; `undefined` if the variant key is absent. */
function variantValue(flag: Flag, variantKey: string | undefined): FlagValue | undefined {
  if (variantKey === undefined) return undefined;
  return flag.variants[variantKey]?.value;
}

const error = (message: string): FlagEvaluation => ({
  value: undefined,
  variant: undefined,
  reason: "ERROR",
  errorCode: "GENERAL",
  errorMessage: message,
});

/** Resolve a {@link Serve} (fixed variant or split) to a variant key + reason. */
function resolveServe(
  flag: Flag,
  serve: Serve,
  context: EvaluationContext,
  matchedReason: "TARGETING_MATCH" | "STATIC",
): FlagEvaluation {
  if (serve.split) {
    const bucketingKey = resolveBucketingKey(context);
    if (bucketingKey === undefined) {
      // No bucketing key: degrade to the default variant rather than guessing.
      const value = variantValue(flag, flag.defaultVariant);
      if (value === undefined) return error(`default variant "${flag.defaultVariant}" not found`);
      return {
        value,
        variant: flag.defaultVariant,
        reason: "DEFAULT",
        errorCode: "TARGETING_KEY_MISSING",
      };
    }
    const variant = pickVariant({
      flagKey: flag.key,
      targetingKey: bucketingKey,
      salt: flag.salt,
      split: serve.split,
    });
    const value = variantValue(flag, variant);
    if (value === undefined) return error(`split selected unknown variant "${variant}"`);
    return { value, variant, reason: "SPLIT" };
  }

  const value = variantValue(flag, serve.variant);
  if (value === undefined) return error(`serve references unknown variant "${serve.variant}"`);
  return { value, variant: serve.variant, reason: matchedReason };
}

/**
 * Evaluate a flag against an evaluation context.
 *
 * @returns A {@link FlagEvaluation}. `value` is `undefined` only when the flag
 * config is invalid (reason `ERROR`); the provider substitutes the caller's
 * default in that case.
 *
 * @example
 * ```ts
 * import { evaluateFlag } from "@xtandard/flags";
 *
 * const flag = {
 *   key: "new-onboarding",
 *   type: "boolean" as const,
 *   enabled: true,
 *   defaultVariant: "off",
 *   variants: { on: { value: true }, off: { value: false } },
 *   fallthrough: { variant: "off" },
 * };
 *
 * const { value, variant, reason } = evaluateFlag(flag, { targetingKey: "user-1" });
 * // value: false, variant: "off", reason: "STATIC"
 * ```
 */
export function evaluateFlag(
  flag: Flag,
  context: EvaluationContext,
  allFlags?: Record<string, Flag>,
  segments?: SegmentMap,
): FlagEvaluation {
  return evaluateFlagInternal(flag, context, allFlags ?? {}, segments ?? {}, new Set());
}

/** Serve the default variant because a prerequisite was not satisfied. */
function prerequisiteFailed(flag: Flag): FlagEvaluation {
  const value = variantValue(flag, flag.defaultVariant);
  if (value === undefined) return error(`default variant "${flag.defaultVariant}" not found`);
  return { value, variant: flag.defaultVariant, reason: "PREREQUISITE_FAILED" };
}

/**
 * Core evaluation with prerequisite resolution. `allFlags` lets prerequisites be
 * resolved by re-evaluating the depended-on flags against the same context;
 * `chain` carries the in-progress flag keys for cycle detection (snapshots are
 * validated acyclic at publish, this is a runtime backstop).
 */
function evaluateFlagInternal(
  flag: Flag,
  context: EvaluationContext,
  allFlags: Record<string, Flag>,
  segments: SegmentMap,
  chain: Set<string>,
): FlagEvaluation {
  // 1. Disabled → default variant value.
  if (!flag.enabled) {
    const value = variantValue(flag, flag.defaultVariant);
    if (value === undefined) return error(`default variant "${flag.defaultVariant}" not found`);
    return { value, variant: flag.defaultVariant, reason: "DISABLED" };
  }

  // 2. Prerequisites: every depended-on flag must resolve to its required variant.
  if (flag.prerequisites && flag.prerequisites.length > 0) {
    const nextChain = new Set(chain).add(flag.key);
    for (const prereq of flag.prerequisites) {
      // Self/cyclic reference, or a missing prerequisite flag → fail closed.
      if (nextChain.has(prereq.flagKey)) return prerequisiteFailed(flag);
      const prereqFlag = allFlags[prereq.flagKey];
      if (!prereqFlag) return prerequisiteFailed(flag);
      const result = evaluateFlagInternal(prereqFlag, context, allFlags, segments, nextChain);
      if (result.variant !== prereq.variant) return prerequisiteFailed(flag);
    }
  }

  // 3. Exact overrides on the bucketing key.
  if (flag.overrides && flag.overrides.length > 0) {
    const bucketingKey = resolveBucketingKey(context);
    if (bucketingKey !== undefined) {
      const override = flag.overrides.find((o) => o.targetingKey === bucketingKey);
      if (override) {
        const value = variantValue(flag, override.variant);
        if (value === undefined) {
          return error(`override references unknown variant "${override.variant}"`);
        }
        return { value, variant: override.variant, reason: "STATIC" };
      }
    }
  }

  // 4. Targeting rules in order; first match wins.
  if (flag.rules && flag.rules.length > 0) {
    for (const rule of flag.rules) {
      if (matchesRule(rule.conditions, context, segments)) {
        return resolveServe(flag, rule.serve, context, "TARGETING_MATCH");
      }
    }
  }

  // 5. Fallthrough.
  return resolveServe(flag, flag.fallthrough, context, "STATIC");
}
