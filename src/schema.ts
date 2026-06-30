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
  | "notExists"
  /**
   * Membership in a reusable {@link Segment}. `value` is the segment's key.
   * Resolved (inlined) at **compile time** — the runtime evaluator and compiled
   * snapshots never contain this operator (see {@link ./snapshot.compileDraft}).
   */
  | "inSegment"
  /**
   * Negated segment membership — true when the context does **not** satisfy the
   * segment. `value` is the segment's key. Unlike `inSegment` it can't be inlined
   * (negating an AND is an OR), so the resolved segments are embedded in the
   * snapshot ({@link Snapshot.segments}) and the evaluator checks membership.
   */
  | "notInSegment"
  /**
   * Match a JSON **query document** (`value`) against the context using a
   * pluggable, named matcher (see {@link ./matchers}). `value` is the query (e.g.
   * a sift/mingo filter); {@link Condition.matcher} names the engine. The subject
   * is `context[attribute]` when `attribute` is set, else the whole context.
   * Evaluated in-process, fail-closed; an unregistered matcher never matches.
   */
  | "matches"
  /** Negated {@link ConditionOperator} `matches` — true when the query does **not** match. */
  | "notMatches";

/**
 * A single predicate evaluated against the {@link EvaluationContext}.
 *
 * `value` is unused for `exists`/`notExists`. For `in`/`notIn` it is an array.
 * For `matches`/`notMatches` it is a JSON query document.
 */
export interface Condition {
  /** Evaluation-context attribute to read (e.g. `"country"`, `"plan"`). */
  attribute: string;
  operator: ConditionOperator;
  value?: JsonValue;
  /**
   * For `matches`/`notMatches` only: the name of the registered matcher to use
   * (see {@link ./matchers.registerMatcher}). Defaults to
   * {@link ./matchers.DEFAULT_MATCHER} (`"default"`) when omitted. Ignored by all
   * other operators.
   */
  matcher?: string;
}

/**
 * A named, reusable audience — a set of conditions (logical AND) referenced by
 * targeting rules via the `inSegment` operator. Segments are an **authoring**
 * convenience: they are resolved (inlined) into rules at compile time and never
 * appear in the runtime snapshot, so the evaluator stays segment-agnostic.
 */
export interface Segment {
  key: string;
  name?: string;
  description?: string;
  /** All conditions must pass (logical AND). May reference other segments via `inSegment`. */
  conditions: Condition[];
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
 * A dependency on another flag: this flag is only "live" when the prerequisite
 * flag resolves to the required {@link variant} for the same context. Otherwise
 * the dependent flag serves its default variant (reason `PREREQUISITE_FAILED`).
 * The dependency graph is validated acyclic at publish time.
 */
export interface Prerequisite {
  /** Key of the flag this one depends on. */
  flagKey: string;
  /** The variant the prerequisite flag must resolve to. */
  variant: string;
}

/** Who owns/maintains a flag — organizational metadata, never consulted by the evaluator. */
export interface FlagOwner {
  /** Owner name or handle. */
  name: string;
  /** Optional contact email. */
  email?: string;
  /** Optional owning team. */
  team?: string;
}

/**
 * A feature flag definition. This is the unit edited in drafts and frozen into
 * snapshots.
 *
 * @example
 * ```ts
 * // Boolean flag
 * const darkMode: Flag = {
 *   key: "dark-mode",
 *   type: "boolean",
 *   enabled: true,
 *   defaultVariant: "off",
 *   variants: { on: { value: true }, off: { value: false } },
 *   fallthrough: { variant: "off" },
 * };
 *
 * // String flag with targeting rule
 * const theme: Flag = {
 *   key: "ui-theme",
 *   type: "string",
 *   enabled: true,
 *   defaultVariant: "default",
 *   variants: { default: { value: "light" }, dark: { value: "dark" } },
 *   fallthrough: { variant: "default" },
 *   rules: [{
 *     id: "rule-1",
 *     conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
 *     serve: { variant: "dark" },
 *   }],
 * };
 * ```
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
  /**
   * Other flags that must resolve to a required variant for this flag to be live.
   * Checked right after the enabled gate, before overrides/rules. Acyclic.
   */
  prerequisites?: Prerequisite[];
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
  /** Who owns/maintains this flag (name, optional email/team). */
  owner?: FlagOwner;
  /**
   * ISO-8601 timestamp marking the flag as archived, or `null`/absent if active.
   * Archived flags are **excluded from compiled snapshots** (see {@link ./snapshot.compileDraft}),
   * so they leave SDK payloads and stop being evaluated — but they remain in the draft for
   * history/restore. The evaluator never sees this field.
   */
  archivedAt?: string | null;
  /** ISO-8601 timestamp set when the flag is first created (stamped by {@link ./core.FlagsCore.upsertFlag}). */
  createdAt?: string;
  /** ISO-8601 timestamp updated on every change (stamped by {@link ./core.FlagsCore.upsertFlag}). */
  updatedAt?: string;
  /**
   * Expected lifetime in days. When set, a flag older than this and idle for a
   * while is flagged as **stale** (see {@link ./lifecycle.flagStaleness}) — a hint
   * to clean it up. Purely organizational; does not affect evaluation.
   */
  expectedLifetimeDays?: number;
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
  /**
   * Resolved segments referenced by `notInSegment` conditions, embedded so the
   * runtime evaluator can check (negated) membership without the admin store.
   * Present only when a flag uses `notInSegment`; `inSegment` is inlined instead.
   */
  segments?: Record<string, Segment>;
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
  | "PREREQUISITE_FAILED"
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
