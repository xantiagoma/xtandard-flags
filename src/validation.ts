/**
 * Runtime validation for flags and drafts, built on `valibot`.
 *
 * This is the **admin/compile path** only — the request-path evaluator and
 * provider never import this module, so `valibot` stays out of the runtime
 * bundle. Validation combines structural parsing (valibot) with semantic
 * cross-field checks (variant references, value/type agreement, split weights).
 *
 * @module
 */

import * as v from "valibot";
import { leafConditions } from "./schema.ts";
import type { ConditionNode, Draft, Flag, FlagType, Segment, Serve } from "./schema.ts";

const conditionOperatorSchema = v.picklist([
  "equals",
  "notEquals",
  "in",
  "notIn",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "semverEquals",
  "semverGreaterThan",
  "semverLessThan",
  "exists",
  "notExists",
  "inSegment",
  "notInSegment",
  "matches",
  "notMatches",
]);

const jsonValueSchema: v.GenericSchema<unknown> = v.lazy(() =>
  v.union([
    v.string(),
    v.number(),
    v.boolean(),
    v.null(),
    v.array(jsonValueSchema),
    v.record(v.string(), jsonValueSchema),
  ]),
);

const conditionSchema = v.object({
  // `inSegment`/`matches` conditions carry no attribute; the non-empty check is
  // enforced semantically per-operator in {@link checkConditions}.
  attribute: v.string(),
  operator: conditionOperatorSchema,
  value: v.optional(jsonValueSchema),
  // `matches`/`notMatches` only: name of the registered query matcher.
  matcher: v.optional(v.string()),
});

// A node is a leaf condition or a boolean group (`all`/`any`/`not`), nested
// arbitrarily. Recursive, so the group arms reference the node schema lazily.
const conditionNodeSchema: v.GenericSchema<unknown> = v.lazy(() =>
  v.union([
    conditionSchema,
    v.object({ all: v.array(conditionNodeSchema) }),
    v.object({ any: v.array(conditionNodeSchema) }),
    v.object({ not: conditionNodeSchema }),
  ]),
);

const segmentSchema = v.object({
  key: v.pipe(v.string(), v.minLength(1), v.regex(/^[a-zA-Z0-9._-]+$/)),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  conditions: v.array(conditionNodeSchema),
});

const splitEntrySchema = v.object({
  variant: v.pipe(v.string(), v.minLength(1)),
  weight: v.pipe(v.number(), v.minValue(0)),
});

const serveSchema = v.union([
  v.object({ variant: v.pipe(v.string(), v.minLength(1)) }),
  v.object({ split: v.pipe(v.array(splitEntrySchema), v.minLength(1)) }),
]);

const ruleSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.optional(v.string()),
  conditions: v.array(conditionNodeSchema),
  serve: serveSchema,
});

const overrideSchema = v.object({
  targetingKey: v.pipe(v.string(), v.minLength(1)),
  variant: v.pipe(v.string(), v.minLength(1)),
});

const prerequisiteSchema = v.object({
  flagKey: v.pipe(v.string(), v.minLength(1)),
  variant: v.pipe(v.string(), v.minLength(1)),
});

const variantSchema = v.object({
  value: jsonValueSchema,
  name: v.optional(v.string()),
  description: v.optional(v.string()),
});

const ownerSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  email: v.optional(v.string()),
  team: v.optional(v.string()),
});

const durationUnitSchema = v.picklist(["seconds", "minutes", "hours", "days"]);
const flagDurationSchema = v.object({
  value: v.pipe(v.number(), v.minValue(0)),
  unit: durationUnitSchema,
});
const lifecycleSchema = v.object({
  expiry: v.union([
    v.object({
      kind: v.literal("duration"),
      value: v.pipe(v.number(), v.minValue(0)),
      unit: durationUnitSchema,
      from: v.picklist(["createdAt", "updatedAt"]),
    }),
    v.object({ kind: v.literal("datetime"), at: v.pipe(v.string(), v.minLength(1)) }),
  ]),
  idle: v.optional(flagDurationSchema),
});

const flagTestSchema = v.object({
  name: v.optional(v.string()),
  context: v.record(v.string(), v.unknown()),
  expect: v.object({
    variant: v.optional(v.string()),
    value: v.optional(jsonValueSchema),
  }),
});

const flagTypeSchema = v.picklist(["boolean", "string", "number", "json"]);

/** Structural schema for a {@link Flag}. Semantic checks run separately. */
export const flagSchema = v.object({
  key: v.pipe(v.string(), v.minLength(1), v.regex(/^[a-zA-Z0-9._-]+$/)),
  type: flagTypeSchema,
  enabled: v.boolean(),
  description: v.optional(v.string()),
  defaultVariant: v.pipe(v.string(), v.minLength(1)),
  variants: v.record(v.string(), variantSchema),
  prerequisites: v.optional(v.array(prerequisiteSchema)),
  overrides: v.optional(v.array(overrideSchema)),
  rules: v.optional(v.array(ruleSchema)),
  fallthrough: serveSchema,
  salt: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  owner: v.optional(ownerSchema),
  archivedAt: v.optional(v.nullable(v.string())),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
  lifecycle: v.optional(lifecycleSchema),
  schedule: v.optional(
    v.object({ enableAt: v.optional(v.string()), disableAt: v.optional(v.string()) }),
  ),
  tests: v.optional(v.array(flagTestSchema)),
});

/** A single validation problem with a dotted path into the offending data. */
export interface ValidationError {
  path: string;
  message: string;
}

/** Result of {@link validateFlag} / {@link validateDraft}. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function valueMatchesType(value: unknown, type: FlagType): boolean {
  switch (type) {
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "json":
      return value !== undefined;
    default:
      return false;
  }
}

/**
 * Per-operator condition checks: `inSegment`/`notInSegment` need a non-empty
 * segment key (and no attribute); `matches`/`notMatches` need a JSON object query
 * (attribute optional — empty matches the whole context); every other operator
 * needs a non-empty `attribute`.
 */
function checkConditions(
  conditions: ConditionNode[],
  path: string,
  errors: ValidationError[],
): void {
  // Per-operator checks apply to leaf conditions anywhere in the AND/OR/NOT tree.
  leafConditions(conditions).forEach((c, i) => {
    if (c.operator === "inSegment" || c.operator === "notInSegment") {
      // A single non-empty key, or a non-empty array of non-empty keys (OR).
      const validKey = (k: unknown): k is string => typeof k === "string" && k.length > 0;
      const ok = Array.isArray(c.value)
        ? c.value.length > 0 && c.value.every(validKey)
        : validKey(c.value);
      if (!ok) {
        errors.push({
          path: `${path}[${i}].value`,
          message: `${c.operator} requires a non-empty segment key (or array of keys)`,
        });
      }
    } else if (c.operator === "matches" || c.operator === "notMatches") {
      if (c.value === null || typeof c.value !== "object" || Array.isArray(c.value)) {
        errors.push({
          path: `${path}[${i}].value`,
          message: `${c.operator} requires a JSON object query`,
        });
      }
    } else if (c.attribute.length === 0) {
      errors.push({ path: `${path}[${i}].attribute`, message: "attribute is required" });
    }
  });
}

function checkServe(
  serve: Serve,
  variantKeys: Set<string>,
  path: string,
  errors: ValidationError[],
): void {
  if (serve.split) {
    let positive = 0;
    serve.split.forEach((leg, i) => {
      if (!variantKeys.has(leg.variant)) {
        errors.push({
          path: `${path}.split[${i}].variant`,
          message: `unknown variant "${leg.variant}"`,
        });
      }
      if (leg.weight > 0) positive++;
    });
    if (positive === 0) {
      errors.push({
        path: `${path}.split`,
        message: "at least one split leg must have a positive weight",
      });
    }
  } else if (!variantKeys.has(serve.variant)) {
    errors.push({ path: `${path}.variant`, message: `unknown variant "${serve.variant}"` });
  }
}

/**
 * Validate a single flag: structure + semantic cross-field checks.
 *
 * @example
 * ```ts
 * import { validateFlag } from "@xtandard/flags";
 *
 * const result = validateFlag({
 *   key: "dark-mode",
 *   type: "boolean",
 *   enabled: true,
 *   defaultVariant: "off",
 *   variants: { on: { value: true }, off: { value: false } },
 *   fallthrough: { variant: "off" },
 * });
 * // result.valid === true, result.errors === []
 * ```
 */
export function validateFlag(input: unknown, basePath = "flag"): ValidationResult {
  const parsed = v.safeParse(flagSchema, input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.issues.map((issue) => ({
        path: `${basePath}.${(issue.path ?? []).map((p) => String(p.key)).join(".")}`,
        message: issue.message,
      })),
    };
  }

  const flag = parsed.output as Flag;
  const errors: ValidationError[] = [];
  const variantKeys = new Set(Object.keys(flag.variants));

  if (variantKeys.size === 0) {
    errors.push({
      path: `${basePath}.variants`,
      message: "a flag must define at least one variant",
    });
  }
  if (!variantKeys.has(flag.defaultVariant)) {
    errors.push({
      path: `${basePath}.defaultVariant`,
      message: `default variant "${flag.defaultVariant}" is not defined in variants`,
    });
  }
  for (const [name, variant] of Object.entries(flag.variants)) {
    if (!valueMatchesType(variant.value, flag.type)) {
      errors.push({
        path: `${basePath}.variants.${name}.value`,
        message: `value does not match flag type "${flag.type}"`,
      });
    }
  }
  (flag.tests ?? []).forEach((t, i) => {
    if (t.expect.variant === undefined && t.expect.value === undefined) {
      errors.push({
        path: `${basePath}.tests[${i}].expect`,
        message: "a test must expect at least one of `variant` or `value`",
      });
    }
    if (t.expect.variant !== undefined && !variantKeys.has(t.expect.variant)) {
      errors.push({
        path: `${basePath}.tests[${i}].expect.variant`,
        message: `unknown variant "${t.expect.variant}"`,
      });
    }
  });
  (flag.overrides ?? []).forEach((o, i) => {
    if (!variantKeys.has(o.variant)) {
      errors.push({
        path: `${basePath}.overrides[${i}].variant`,
        message: `unknown variant "${o.variant}"`,
      });
    }
  });
  (flag.rules ?? []).forEach((rule, i) => {
    checkConditions(rule.conditions, `${basePath}.rules[${i}].conditions`, errors);
    checkServe(rule.serve, variantKeys, `${basePath}.rules[${i}].serve`, errors);
  });
  checkServe(flag.fallthrough, variantKeys, `${basePath}.fallthrough`, errors);

  // Schedule window: enableAt must be before disableAt when both are set.
  const sched = flag.schedule;
  if (sched?.enableAt && sched.disableAt) {
    const start = Date.parse(sched.enableAt);
    const end = Date.parse(sched.disableAt);
    if (!Number.isNaN(start) && !Number.isNaN(end) && start >= end) {
      errors.push({
        path: `${basePath}.schedule.disableAt`,
        message: "disableAt must be after enableAt",
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate every flag in a draft. Errors are prefixed with the flag key.
 *
 * @example
 * ```ts
 * import { validateDraft } from "@xtandard/flags";
 *
 * const result = validateDraft({
 *   projectKey: "default",
 *   environmentKey: "production",
 *   flags: {
 *     "dark-mode": {
 *       key: "dark-mode",
 *       type: "boolean",
 *       enabled: true,
 *       defaultVariant: "off",
 *       variants: { on: { value: true }, off: { value: false } },
 *       fallthrough: { variant: "off" },
 *     },
 *   },
 * });
 * if (!result.valid) {
 *   for (const e of result.errors) console.error(e.path, e.message);
 * }
 * ```
 */
export function validateDraft(draft: Draft): ValidationResult {
  const errors: ValidationError[] = [];
  for (const [key, flag] of Object.entries(draft.flags)) {
    if (flag.key !== key) {
      errors.push({
        path: `flags.${key}.key`,
        message: `flag key "${flag.key}" does not match its map key "${key}"`,
      });
    }
    const result = validateFlag(flag, `flags.${key}`);
    errors.push(...result.errors);
  }
  errors.push(...validatePrerequisiteGraph(draft.flags));
  return { valid: errors.length === 0, errors };
}

/**
 * Cross-flag prerequisite validation: every referenced flag/variant exists and
 * the dependency graph is acyclic. Returns an empty array when sound.
 *
 * @example
 * ```ts
 * import { validatePrerequisiteGraph } from "@xtandard/flags";
 *
 * const errors = validatePrerequisiteGraph(draft.flags);
 * if (errors.length) console.error(errors);
 * ```
 */
export function validatePrerequisiteGraph(flags: Record<string, Flag>): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Dangling flag refs + missing required variants.
  for (const [key, flag] of Object.entries(flags)) {
    (flag.prerequisites ?? []).forEach((p, i) => {
      const target = flags[p.flagKey];
      if (!target) {
        errors.push({
          path: `flags.${key}.prerequisites[${i}].flagKey`,
          message: `unknown prerequisite flag "${p.flagKey}"`,
        });
      } else if (!(p.variant in target.variants)) {
        errors.push({
          path: `flags.${key}.prerequisites[${i}].variant`,
          message: `prerequisite flag "${p.flagKey}" has no variant "${p.variant}"`,
        });
      }
    });
  }

  // 2. Cycle detection (DFS with a recursion stack). Report each cycle once.
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const reported = new Set<string>();

  const visit = (key: string, stack: string[]): void => {
    color.set(key, GRAY);
    stack.push(key);
    for (const prereq of flags[key]?.prerequisites ?? []) {
      const next = prereq.flagKey;
      if (!flags[next]) continue; // dangling handled above
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const cycle = [...stack.slice(stack.indexOf(next)), next].join(" → ");
        if (!reported.has(cycle)) {
          reported.add(cycle);
          errors.push({
            path: `flags.${key}.prerequisites`,
            message: `cyclic prerequisite: ${cycle}`,
          });
        }
      } else if (c === WHITE) {
        visit(next, stack);
      }
    }
    stack.pop();
    color.set(key, BLACK);
  };

  for (const key of Object.keys(flags)) {
    if ((color.get(key) ?? WHITE) === WHITE) visit(key, []);
  }

  return errors;
}

/**
 * Validate a single reusable {@link Segment}: structure + `inSegment` value checks.
 * Cross-entity reference/cycle checks live in {@link ./segments.validateSegmentReferences}.
 *
 * @example
 * ```ts
 * import { validateSegment } from "@xtandard/flags";
 *
 * const result = validateSegment({
 *   key: "eu-beta",
 *   conditions: [{ attribute: "country", operator: "in", value: ["FR", "DE"] }],
 * });
 * // result.valid === true
 * ```
 */
export function validateSegment(input: unknown, basePath = "segment"): ValidationResult {
  const parsed = v.safeParse(segmentSchema, input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.issues.map((issue) => ({
        path: `${basePath}.${(issue.path ?? []).map((p) => String(p.key)).join(".")}`,
        message: issue.message,
      })),
    };
  }
  const segment = parsed.output as Segment;
  const errors: ValidationError[] = [];
  checkConditions(segment.conditions, `${basePath}.conditions`, errors);
  return { valid: errors.length === 0, errors };
}

/** Throwing variant of {@link validateDraft}; raises {@link DraftValidationError}. */
export function assertValidDraft(draft: Draft): void {
  const result = validateDraft(draft);
  if (!result.valid) throw new DraftValidationError(result.errors);
}

/** Raised by {@link assertValidDraft} when a draft fails validation. */
export class DraftValidationError extends Error {
  readonly errors: ValidationError[];
  constructor(errors: ValidationError[]) {
    super(
      `Draft validation failed:\n${errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n")}`,
    );
    this.name = "DraftValidationError";
    this.errors = errors;
  }
}
