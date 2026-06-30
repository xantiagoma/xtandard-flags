/**
 * The OpenFeature provider for `@xtandard/flags` — the single most important
 * runtime component.
 *
 * **Promise:** applications evaluate flags from in-memory snapshots. The admin /
 * control plane, and even the storage backend, can be DOWN and the app keeps
 * serving last-known-good values. Storage is touched only on `initialize`, on a
 * background refresh timer, and (best-effort) on watch notifications — never on
 * the request path. Once a snapshot is in memory, resolution is pure, synchronous
 * work that cannot fail because storage is unavailable.
 *
 * ## Failure semantics (the part that must be exactly right)
 * - `initialize()` failing or returning no snapshot does NOT throw — the provider
 *   still constructs and serves the caller's defaults.
 * - A background refresh that throws KEEPS the last-known-good snapshot and marks
 *   it `stale`; it never clears memory. A later successful refresh replaces memory
 *   and clears `stale`.
 * - Resolution never reads storage and never throws; on any problem it returns the
 *   caller's `defaultValue` with an OpenFeature-compatible reason/errorCode.
 *
 * ## Zero runtime dependency on `@openfeature/server-sdk`
 * `@openfeature/server-sdk` is an *optional* peer dependency. OpenFeature's
 * `StandardResolutionReasons` is a runtime `const` object and `ErrorCode` is a
 * runtime `enum` — importing either would create a hard runtime dependency. We
 * therefore import the SDK for **types only** ({@link import type}) and replicate
 * the exact string values as local literals ({@link OF_REASON}, {@link OF_ERROR}).
 * The returned object structurally satisfies the `Provider` interface without the
 * package being installed at runtime.
 *
 * @module
 */

import type { ComparatorRegistry } from "./comparators.ts";
import { withComparators } from "./comparators.ts";
import { evaluateFlag } from "./evaluator.ts";
import type { MatcherRegistry } from "./matchers.ts";
import { withMatchers } from "./matchers.ts";
import { activeVersionKey, snapshotsPrefix } from "./keys.ts";
import type {
  EvaluationContext,
  EvaluationReason,
  Flag,
  FlagType,
  FlagValue,
  JsonValue,
  Snapshot,
} from "./schema.ts";
import { SnapshotStore } from "./snapshot.ts";
import type { FlagsStorage } from "./storage/contract.ts";
import { isWatchable } from "./storage/contract.ts";

// --- Type-only imports from the optional peer. No runtime dependency. ---
import type {
  ErrorCode as OFErrorCode,
  EvaluationContext as OFEvaluationContext,
  FlagMetadata as OFFlagMetadata,
  JsonValue as OFJsonValue,
  Logger as OFLogger,
  Provider as OFProvider,
  ProviderMetadata as OFProviderMetadata,
  ResolutionDetails as OFResolutionDetails,
} from "@openfeature/server-sdk";

/**
 * OpenFeature standard resolution reason strings, replicated as literals to avoid
 * a runtime import of the optional peer's `StandardResolutionReasons` const.
 */
const OF_REASON = {
  STATIC: "STATIC",
  DEFAULT: "DEFAULT",
  TARGETING_MATCH: "TARGETING_MATCH",
  SPLIT: "SPLIT",
  CACHED: "CACHED",
  DISABLED: "DISABLED",
  UNKNOWN: "UNKNOWN",
  STALE: "STALE",
  ERROR: "ERROR",
} as const;

/**
 * OpenFeature `ErrorCode` string values, replicated as literals to avoid a runtime
 * import of the optional peer's `ErrorCode` enum.
 */
const OF_ERROR = {
  PROVIDER_NOT_READY: "PROVIDER_NOT_READY",
  PROVIDER_FATAL: "PROVIDER_FATAL",
  FLAG_NOT_FOUND: "FLAG_NOT_FOUND",
  PARSE_ERROR: "PARSE_ERROR",
  TYPE_MISMATCH: "TYPE_MISMATCH",
  TARGETING_KEY_MISSING: "TARGETING_KEY_MISSING",
  INVALID_CONTEXT: "INVALID_CONTEXT",
  GENERAL: "GENERAL",
  // Cast: the literal string values are exactly OpenFeature's `ErrorCode` enum
  // member values. `ErrorCode` is a nominal runtime enum we refuse to import at
  // runtime, so we coerce our literals to its *type* (erased at compile time).
} as const satisfies Record<string, string> as Record<
  | "PROVIDER_NOT_READY"
  | "PROVIDER_FATAL"
  | "FLAG_NOT_FOUND"
  | "PARSE_ERROR"
  | "TYPE_MISMATCH"
  | "TARGETING_KEY_MISSING"
  | "INVALID_CONTEXT"
  | "GENERAL",
  OFErrorCode
>;

/** A minimal logger; compatible with OpenFeature's {@link OFLogger} subset we use. */
export interface ProviderLogger {
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}

/** Options for {@link createOpenFeatureProvider}. */
export interface OpenFeatureProviderOptions {
  /** Runtime storage holding published snapshots (read-only on the request path). */
  storage: FlagsStorage;
  /** Project to evaluate. Defaults to `"default"`. */
  projectKey?: string;
  /** Environment to evaluate. Defaults to `"production"`. */
  environmentKey?: string;
  /**
   * Background refresh interval in milliseconds. Defaults to `30_000`. A value
   * `<= 0` disables polling (watch, if available, still applies).
   */
  refreshIntervalMs?: number;
  /** Optional logger for non-fatal load/refresh problems. */
  logger?: ProviderLogger;
  /**
   * Custom comparators for value-object types in the evaluation context (e.g.
   * Dinero, Decimal). Layered over the process-wide registry from
   * {@link ./comparators.registerComparator} for evaluations made by this
   * provider. See {@link ./comparators.ComparatorRegistry}.
   */
  comparators?: ComparatorRegistry;
  /**
   * Named query matchers backing the `matches`/`notMatches` operators (e.g. a
   * sift/mingo engine). Layered over the process-wide registry from
   * {@link ./matchers.registerMatcher} for evaluations made by this provider.
   * See {@link ./matchers.MatcherRegistry}.
   */
  matchers?: MatcherRegistry;
}

/**
 * The provider returned by {@link createOpenFeatureProvider}. Structurally
 * implements OpenFeature's server `Provider` interface, plus a public
 * {@link XtandardOpenFeatureProvider.refresh} method (primarily for tests and for
 * callers that want to force a reload).
 */
export interface XtandardOpenFeatureProvider extends OFProvider {
  readonly metadata: OFProviderMetadata;
  initialize(context?: OFEvaluationContext): Promise<void>;
  onClose(): Promise<void>;
  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: OFEvaluationContext,
    logger?: OFLogger,
  ): Promise<OFResolutionDetails<boolean>>;
  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: OFEvaluationContext,
    logger?: OFLogger,
  ): Promise<OFResolutionDetails<string>>;
  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: OFEvaluationContext,
    logger?: OFLogger,
  ): Promise<OFResolutionDetails<number>>;
  resolveObjectEvaluation<T extends OFJsonValue>(
    flagKey: string,
    defaultValue: T,
    context: OFEvaluationContext,
    logger?: OFLogger,
  ): Promise<OFResolutionDetails<T>>;
  /**
   * Force an immediate reload of the active snapshot from storage. Honours the
   * last-known-good policy: a failure keeps the current snapshot and marks it
   * stale. Primarily exposed for tests and explicit cache-busting.
   */
  refresh(): Promise<void>;
  /** ISO timestamp of the last successful load, or `null` if never loaded. */
  readonly lastUpdatedAt: string | null;
  /** Whether the in-memory snapshot is stale (last refresh failed). */
  readonly stale: boolean;
}

/**
 * Map an internal {@link EvaluationReason} to an OpenFeature reason string. Our
 * reasons are a superset; the extra ones (`CACHED`, `STALE`, `FLAG_NOT_FOUND`)
 * either map onto OF standards or, for `FLAG_NOT_FOUND`, are surfaced as `ERROR`
 * with an `errorCode` per OpenFeature convention.
 */
export function toOpenFeatureReason(reason: EvaluationReason): string {
  switch (reason) {
    case "STATIC":
      return OF_REASON.STATIC;
    case "DEFAULT":
      return OF_REASON.DEFAULT;
    case "TARGETING_MATCH":
      return OF_REASON.TARGETING_MATCH;
    case "SPLIT":
      return OF_REASON.SPLIT;
    case "DISABLED":
      return OF_REASON.DISABLED;
    case "PREREQUISITE_FAILED":
      // Not an OpenFeature standard reason, but a valid free-form reason string
      // (LaunchDarkly uses the same). Surfaced verbatim so callers can branch on it.
      return "PREREQUISITE_FAILED";
    case "CACHED":
      return OF_REASON.CACHED;
    case "STALE":
      return OF_REASON.STALE;
    case "FLAG_NOT_FOUND":
    case "ERROR":
      return OF_REASON.ERROR;
    default: {
      const _never: never = reason;
      void _never;
      return OF_REASON.UNKNOWN;
    }
  }
}

/** The {@link FlagType} expected by each typed resolve method. */
type ResolveKind = "boolean" | "string" | "number" | "object";

/** Map a resolve method's kind to the {@link FlagType} it requires. */
function expectedFlagType(kind: ResolveKind): FlagType {
  return kind === "object" ? "json" : kind;
}

/**
 * Convert an OpenFeature evaluation context into our {@link EvaluationContext}.
 * They are structurally compatible (`targetingKey` + arbitrary attributes); this
 * is a cheap shallow copy that also tolerates `undefined`.
 */
function toInternalContext(context: OFEvaluationContext | undefined): EvaluationContext {
  if (!context) return {};
  return { ...context } as EvaluationContext;
}

/**
 * Create a storage-backed, memory-first OpenFeature provider.
 *
 * The provider loads the active snapshot into memory on {@link initialize} and
 * refreshes it in the background. All flag resolution reads from memory only.
 *
 * @example
 * ```ts
 * import { OpenFeature } from "@openfeature/server-sdk";
 * import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
 *
 * const provider = createOpenFeatureProvider({ storage });
 * await OpenFeature.setProviderAndWait(provider);
 * const client = OpenFeature.getClient();
 * const enabled = await client.getBooleanValue("new-dashboard", false, { targetingKey: "u1" });
 * ```
 */
export function createOpenFeatureProvider(
  options: OpenFeatureProviderOptions,
): XtandardOpenFeatureProvider {
  const projectKey = options.projectKey ?? "default";
  const environmentKey = options.environmentKey ?? "production";
  const refreshIntervalMs = options.refreshIntervalMs ?? 30_000;
  const logger = options.logger;
  const store = new SnapshotStore(options.storage);

  // --- In-memory, last-known-good state. ---
  let snapshot: Snapshot | null = null;
  let lastUpdatedAt: string | null = null;
  let stale = false;

  let timer: ReturnType<typeof setInterval> | undefined;
  let unwatch: (() => void) | undefined;
  let closed = false;
  // Serialize refreshes so concurrent triggers (timer + watch) don't interleave.
  let refreshing: Promise<void> | null = null;
  // A refresh requested while one is already in flight is coalesced into a single
  // follow-up run. This matters for watch: a publish writes the snapshot then the
  // active-version pointer, firing two notifications; the first refresh may read
  // the stale pointer, so we must run once more after it settles.
  let pending = false;

  const warn = (msg: string): void => {
    if (logger) logger.warn(msg);
  };
  const logError = (msg: string, err?: unknown): void => {
    if (logger) logger.error(msg, err);
  };

  /**
   * Load the active snapshot from storage into memory. On success, replace memory
   * and clear `stale`. On failure, KEEP the last-known-good snapshot and mark
   * `stale` (never clear). Never throws.
   */
  async function load(initial: boolean): Promise<void> {
    try {
      const next = await store.getActiveSnapshot(projectKey, environmentKey);
      if (next === null) {
        // No snapshot published yet. Leave memory as-is (empty on first load).
        if (initial && snapshot === null) {
          warn(
            `[xtandard/flags] no active snapshot for ${projectKey}/${environmentKey}; serving defaults until one is published`,
          );
        }
        // A successful read that returns null is authoritative: not stale.
        if (snapshot === null) stale = false;
        return;
      }
      snapshot = next;
      lastUpdatedAt = new Date().toISOString();
      stale = false;
    } catch (err) {
      // Storage is down. Keep last-known-good; mark stale if we have one.
      if (snapshot !== null) {
        stale = true;
        warn(
          `[xtandard/flags] snapshot refresh failed for ${projectKey}/${environmentKey}; serving last-known-good (stale)`,
        );
      } else if (initial) {
        warn(
          `[xtandard/flags] initial snapshot load failed for ${projectKey}/${environmentKey}; serving defaults`,
        );
      } else {
        logError(
          `[xtandard/flags] snapshot refresh failed for ${projectKey}/${environmentKey}`,
          err,
        );
      }
    }
  }

  /**
   * Public, serialized refresh. Safe to call concurrently: if a refresh is already
   * running, the call coalesces into a single follow-up run that begins after the
   * current one settles (so the latest storage state is always picked up).
   */
  async function refresh(): Promise<void> {
    if (refreshing) {
      pending = true;
      return refreshing;
    }
    refreshing = load(false).finally(() => {
      refreshing = null;
      if (pending) {
        pending = false;
        void refresh();
      }
    });
    return refreshing;
  }

  function startTimer(): void {
    if (refreshIntervalMs <= 0) return;
    timer = setInterval(() => {
      void refresh();
    }, refreshIntervalMs);
    // Don't let the refresh timer keep a Node process alive. Guard for runtimes
    // (e.g. browsers) whose timer handle has no `unref`.
    const handle = timer as unknown as { unref?: () => void };
    if (typeof handle.unref === "function") handle.unref();
  }

  async function startWatch(): Promise<void> {
    if (!isWatchable(options.storage)) return;
    try {
      // Watch both the active-version pointer and the snapshots subtree so we
      // catch publishes and rollbacks promptly. Polling remains the backstop.
      const prefix = snapshotsPrefix(projectKey, environmentKey);
      const activeKey = activeVersionKey(projectKey, environmentKey);
      const onChange = (): void => {
        void refresh();
      };
      const off = await options.storage.watch(prefix, onChange);
      // Some watch implementations key on exact prefixes; subscribe to the
      // active-version key's parent prefix too (it shares the env prefix root).
      let offActive: (() => void) | undefined;
      if (!activeKey.startsWith(prefix)) {
        offActive = await options.storage.watch(activeKey, onChange);
      }
      unwatch = () => {
        off();
        offActive?.();
      };
    } catch (err) {
      // Watch is best-effort; polling still covers us.
      logError(`[xtandard/flags] failed to subscribe to storage watch`, err);
    }
  }

  /**
   * Build a {@link OFResolutionDetails} for the four typed resolve methods. Pure,
   * synchronous, reads only in-memory state.
   */
  function resolve<T extends FlagValue>(
    kind: ResolveKind,
    flagKey: string,
    defaultValue: T,
    context: OFEvaluationContext,
  ): OFResolutionDetails<T> {
    const flagMetadata: OFFlagMetadata = stale ? { stale: true } : {};

    // 1a. No snapshot in memory at all → caller default, reason DEFAULT.
    if (snapshot === null) {
      return {
        value: defaultValue,
        reason: OF_REASON.DEFAULT,
        errorCode: OF_ERROR.FLAG_NOT_FOUND,
        errorMessage: `no snapshot loaded for ${projectKey}/${environmentKey}`,
        flagMetadata,
      };
    }

    // 1b. Flag genuinely absent from the snapshot → ERROR + FLAG_NOT_FOUND.
    const flag: Flag | undefined = snapshot.flags[flagKey];
    if (!flag) {
      return {
        value: defaultValue,
        reason: OF_REASON.ERROR,
        errorCode: OF_ERROR.FLAG_NOT_FOUND,
        errorMessage: `flag "${flagKey}" not found`,
        flagMetadata,
      };
    }

    // 2. Type guard: the flag's declared type must match the resolve method.
    const wanted = expectedFlagType(kind);
    if (flag.type !== wanted) {
      return {
        value: defaultValue,
        reason: OF_REASON.ERROR,
        errorCode: OF_ERROR.TYPE_MISMATCH,
        errorMessage: `flag "${flagKey}" is of type "${flag.type}", expected "${wanted}"`,
        flagMetadata,
      };
    }

    // 3. Evaluate. Pass the whole snapshot so prerequisites + segments resolve.
    // Layer any instance comparators + matchers over the global registries.
    const evaluation = withComparators(options.comparators, () =>
      withMatchers(options.matchers, () =>
        evaluateFlag(flag, toInternalContext(context), snapshot!.flags, snapshot!.segments),
      ),
    );

    // 3a. Evaluation error (or missing value) → caller default + ERROR.
    if (evaluation.reason === "ERROR" || evaluation.value === undefined) {
      return {
        value: defaultValue,
        reason: OF_REASON.ERROR,
        errorCode: OF_ERROR.GENERAL,
        errorMessage: evaluation.errorMessage ?? `evaluation of "${flagKey}" produced no value`,
        flagMetadata,
      };
    }

    // 4. Success. The evaluator guarantees the value matches the flag's declared
    // type, which we have already matched to `kind`, so the cast is sound.
    const details: OFResolutionDetails<T> = {
      value: evaluation.value as T,
      reason: toOpenFeatureReason(evaluation.reason),
      flagMetadata,
    };
    if (evaluation.variant !== undefined) details.variant = evaluation.variant;
    // The evaluator may attach an informative errorCode even on a non-ERROR
    // outcome (e.g. TARGETING_KEY_MISSING when a split degraded to default).
    if (evaluation.errorCode !== undefined) details.errorCode = OF_ERROR[evaluation.errorCode];
    return details;
  }

  const provider: XtandardOpenFeatureProvider = {
    metadata: { name: "xtandard-flags" } as OFProviderMetadata,
    runsOn: "server",

    async initialize(): Promise<void> {
      closed = false;
      await load(true);
      startTimer();
      await startWatch();
    },

    async onClose(): Promise<void> {
      closed = true;
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      if (unwatch) {
        try {
          unwatch();
        } catch (err) {
          logError(`[xtandard/flags] error while unsubscribing watcher`, err);
        }
        unwatch = undefined;
      }
    },

    async refresh(): Promise<void> {
      if (closed) return;
      await refresh();
    },

    async resolveBooleanEvaluation(
      flagKey,
      defaultValue,
      context,
    ): Promise<OFResolutionDetails<boolean>> {
      return resolve("boolean", flagKey, defaultValue, context);
    },
    async resolveStringEvaluation(
      flagKey,
      defaultValue,
      context,
    ): Promise<OFResolutionDetails<string>> {
      return resolve("string", flagKey, defaultValue, context);
    },
    async resolveNumberEvaluation(
      flagKey,
      defaultValue,
      context,
    ): Promise<OFResolutionDetails<number>> {
      return resolve("number", flagKey, defaultValue, context);
    },
    async resolveObjectEvaluation<T extends OFJsonValue>(
      flagKey: string,
      defaultValue: T,
      context: OFEvaluationContext,
    ): Promise<OFResolutionDetails<T>> {
      return resolve<JsonValue>(
        "object",
        flagKey,
        defaultValue as JsonValue,
        context,
      ) as OFResolutionDetails<T>;
    },

    get lastUpdatedAt(): string | null {
      return lastUpdatedAt;
    },
    get stale(): boolean {
      return stale;
    },
  };

  return provider;
}
