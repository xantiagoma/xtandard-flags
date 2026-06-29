/**
 * Core type definitions for `@xtandard/flags`.
 *
 * This module is **types only** — no runtime code, no dependencies. It is safe to
 * import from the request-path evaluator and the OpenFeature provider. Runtime
 * validation (which pulls in `valibot`) lives in {@link ./validation}.
 *
 * @module
 */

/** JSON-serializable value, used for `json`-typed flag variants. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Any concrete value a flag can resolve to. */
export type FlagValue = boolean | string | number | JsonValue;

/** The four flag value types, matching OpenFeature's typed evaluation methods. */
export type FlagType = "boolean" | "string" | "number" | "json";

/**
 * A named, addressable value a flag can serve. Every flag — including boolean
 * flags — is variant-based internally.
 */
export interface Variant {
  /** The value served when this variant is selected. */
  value: FlagValue;
  /** Optional human-friendly name shown in the UI. */
  name?: string;
  /** Optional description shown in the UI. */
  description?: string;
}

/** Comparison/predicate operators available to targeting rule conditions. */
export type ConditionOperator =
  | "equals"
  | "notEquals"
  | "in"
  | "notIn"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "semverEquals"
  | "semverGreaterThan"
  | "semverLessThan"
  | "exists"
  | "notExists";

/**
 * A single predicate evaluated against the {@link EvaluationContext}.
 *
 * `value` is unused for `exists`/`notExists`. For `in`/`notIn` it is an array.
 */
export interface Condition {
  /** Evaluation-context attribute to read (e.g. `"country"`, `"plan"`). */
  attribute: string;
  operator: ConditionOperator;
  value?: JsonValue;
}

/** One leg of a weighted split. Weights need not sum to 100. */
export interface SplitEntry {
  variant: string;
  /** Non-negative relative weight. Zero-weight legs never receive traffic. */
  weight: number;
}

/**
 * What a rule (or fallthrough) serves: either a fixed variant or a deterministic
 * weighted split keyed on the targeting key.
 */
export type Serve = { variant: string; split?: never } | { split: SplitEntry[]; variant?: never };

/** A targeting rule. Rules are evaluated in array order; first match wins. */
export interface Rule {
  /** Stable identifier (used in audit/debugging). */
  id: string;
  name?: string;
  /** All conditions must pass (logical AND) for the rule to match. */
  conditions: Condition[];
  serve: Serve;
}

/** An exact, highest-priority assignment for a specific targeting key. */
export interface Override {
  targetingKey: string;
  variant: string;
}

/**
 * A feature flag definition. This is the unit edited in drafts and frozen into
 * snapshots.
 */
export interface Flag {
  key: string;
  type: FlagType;
  /** When false, evaluation short-circuits to the default variant (reason DISABLED). */
  enabled: boolean;
  description?: string;
  /** Key into {@link variants}; served when disabled or when nothing else matches and no fallthrough applies. */
  defaultVariant: string;
  variants: Record<string, Variant>;
  /** Exact targeting-key assignments, checked before rules. */
  overrides?: Override[];
  /** Ordered targeting rules; first match wins. */
  rules?: Rule[];
  /** Served when the flag is enabled and no override/rule matched. */
  fallthrough: Serve;
  /** Optional per-flag salt that perturbs split bucketing independently of the key. */
  salt?: string;
  /** Free-form organizational labels (e.g. "beta", "checkout", "permanent"). */
  tags?: string[];
}

/** Identity captured on snapshot/audit records. */
export interface Actor {
  id: string;
  email?: string;
  name?: string;
}

/** Current schema version for compiled snapshots. */
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

/**
 * An immutable, versioned, fully-resolved set of flags for one
 * project/environment. This is what the runtime provider loads and evaluates.
 */
export interface Snapshot {
  schemaVersion: number;
  /** Monotonic version identifier, e.g. `"v43"`. */
  version: string;
  projectKey: string;
  environmentKey: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  createdBy?: Actor | null;
  flags: Record<string, Flag>;
}

/** The mutable working copy edited via the admin API before publishing. */
export interface Draft {
  projectKey: string;
  environmentKey: string;
  flags: Record<string, Flag>;
  updatedAt?: string;
  updatedBy?: Actor | null;
}

/** Project metadata record. */
export interface ProjectMeta {
  key: string;
  name?: string;
  createdAt?: string;
}

/** Environment metadata record (scoped to a project). */
export interface EnvironmentMeta {
  key: string;
  name?: string;
  createdAt?: string;
}

/** A single entry in the publish/rollback/update audit log. */
export interface AuditEntry {
  version: string;
  action: "publish" | "rollback" | "update";
  at: string;
  by?: Actor | null;
  /** For rollback: the version that became active. */
  fromVersion?: string;
  message?: string;
}

/**
 * OpenFeature evaluation context. `targetingKey` is the preferred bucketing key
 * for deterministic splits; arbitrary attributes drive targeting rules.
 */
export interface EvaluationContext {
  targetingKey?: string;
  [key: string]: unknown;
}

/**
 * Resolution reasons surfaced by the evaluator. A superset of OpenFeature's
 * standard reasons; {@link ./openfeature} maps these to OF-compatible strings.
 */
export type EvaluationReason =
  | "STATIC"
  | "DEFAULT"
  | "TARGETING_MATCH"
  | "SPLIT"
  | "DISABLED"
  | "CACHED"
  | "STALE"
  | "ERROR"
  | "FLAG_NOT_FOUND";

/** Error codes aligned with OpenFeature's `ErrorCode`. */
export type FlagErrorCode =
  | "FLAG_NOT_FOUND"
  | "TYPE_MISMATCH"
  | "PARSE_ERROR"
  | "TARGETING_KEY_MISSING"
  | "GENERAL";

/** The result of evaluating one flag against a context. */
export interface EvaluationDetail<T extends FlagValue = FlagValue> {
  value: T;
  variant?: string;
  reason: EvaluationReason;
  errorCode?: FlagErrorCode;
  errorMessage?: string;
  flagMetadata?: Record<string, string | number | boolean>;
}
