/**
 * The flag evaluator — the heart of the runtime. Pure, synchronous, zero deps.
 *
 * Implements the evaluation order from the spec:
 *
 * 1. Flag disabled        → default variant value (reason `DISABLED`)
 * 2. Exact overrides      → match on bucketing key (reason `STATIC`)
 * 3. Targeting rules      → first matching rule wins (reason `TARGETING_MATCH` / `SPLIT`)
 * 4. Fallthrough          → fixed variant or deterministic split (reason `STATIC` / `SPLIT`)
 * 5. Invalid config       → no value (reason `ERROR`)
 *
 * "Flag missing" (reason `FLAG_NOT_FOUND`) is handled one level up by the
 * provider, which holds the caller's default value.
 *
 * @module
 */

import { hashToUnitInterval } from "./hash.ts";
import type {
  Condition,
  ConditionOperator,
  EvaluationContext,
  EvaluationReason,
  Flag,
  FlagErrorCode,
  FlagValue,
  Serve,
  SplitEntry,
} from "./schema.ts";

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

function toFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
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
export function evaluateCondition(condition: Condition, context: EvaluationContext): boolean {
  const actual = context[condition.attribute];
  const expected = condition.value;
  const op: ConditionOperator = condition.operator;

  switch (op) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "notExists":
      return actual === undefined || actual === null;
    case "equals":
      return looseEquals(actual, expected);
    case "notEquals":
      return !looseEquals(actual, expected);
    case "in":
      return Array.isArray(expected) && expected.some((e) => looseEquals(e, actual));
    case "notIn":
      return !(Array.isArray(expected) && expected.some((e) => looseEquals(e, actual)));
    case "contains":
      if (Array.isArray(actual)) return actual.some((e) => looseEquals(e, expected));
      return String(actual).includes(String(expected));
    case "notContains":
      if (Array.isArray(actual)) return !actual.some((e) => looseEquals(e, expected));
      return !String(actual).includes(String(expected));
    case "startsWith":
      return typeof actual === "string" && actual.startsWith(String(expected));
    case "endsWith":
      return typeof actual === "string" && actual.endsWith(String(expected));
    case "greaterThan":
    case "greaterThanOrEqual":
    case "lessThan":
    case "lessThanOrEqual": {
      const a = toFiniteNumber(actual);
      const b = toFiniteNumber(expected);
      if (a === undefined || b === undefined) return false;
      if (op === "greaterThan") return a > b;
      if (op === "greaterThanOrEqual") return a >= b;
      if (op === "lessThan") return a < b;
      return a <= b;
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
    default: {
      // Exhaustiveness guard: unknown operators never match.
      const _never: never = op;
      void _never;
      return false;
    }
  }
}

/** All conditions must pass (logical AND). An empty condition list always matches. */
export function matchesRule(conditions: Condition[], context: EvaluationContext): boolean {
  return conditions.every((c) => evaluateCondition(c, context));
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
export function evaluateFlag(flag: Flag, context: EvaluationContext): FlagEvaluation {
  // 1. Disabled → default variant value.
  if (!flag.enabled) {
    const value = variantValue(flag, flag.defaultVariant);
    if (value === undefined) return error(`default variant "${flag.defaultVariant}" not found`);
    return { value, variant: flag.defaultVariant, reason: "DISABLED" };
  }

  // 2. Exact overrides on the bucketing key.
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

  // 3. Targeting rules in order; first match wins.
  if (flag.rules && flag.rules.length > 0) {
    for (const rule of flag.rules) {
      if (matchesRule(rule.conditions, context)) {
        return resolveServe(flag, rule.serve, context, "TARGETING_MATCH");
      }
    }
  }

  // 4. Fallthrough.
  return resolveServe(flag, flag.fallthrough, context, "STATIC");
}
