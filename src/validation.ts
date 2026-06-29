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
import type { Draft, Flag, FlagType, Serve } from "./schema.ts";

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
  attribute: v.pipe(v.string(), v.minLength(1)),
  operator: conditionOperatorSchema,
  value: v.optional(jsonValueSchema),
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
  conditions: v.array(conditionSchema),
  serve: serveSchema,
});

const overrideSchema = v.object({
  targetingKey: v.pipe(v.string(), v.minLength(1)),
  variant: v.pipe(v.string(), v.minLength(1)),
});

const variantSchema = v.object({
  value: jsonValueSchema,
  name: v.optional(v.string()),
  description: v.optional(v.string()),
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
  overrides: v.optional(v.array(overrideSchema)),
  rules: v.optional(v.array(ruleSchema)),
  fallthrough: serveSchema,
  salt: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
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
  (flag.overrides ?? []).forEach((o, i) => {
    if (!variantKeys.has(o.variant)) {
      errors.push({
        path: `${basePath}.overrides[${i}].variant`,
        message: `unknown variant "${o.variant}"`,
      });
    }
  });
  (flag.rules ?? []).forEach((rule, i) => {
    checkServe(rule.serve, variantKeys, `${basePath}.rules[${i}].serve`, errors);
  });
  checkServe(flag.fallthrough, variantKeys, `${basePath}.fallthrough`, errors);

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
