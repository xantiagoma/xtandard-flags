/**
 * `@xtandard/flags` — public surface.
 *
 * Re-exports the core contracts, types, evaluator, snapshot model, and the
 * admin/server factories. Storage/auth/authorization/adapter implementations
 * live behind their own subpath exports (e.g. `@xtandard/flags/storage/redis`).
 *
 * @example
 * ```ts
 * import { createFetchHandler } from "@xtandard/flags";
 * import { createRedisStorage } from "@xtandard/flags/storage/redis";
 *
 * const storage = createRedisStorage({ url: process.env.REDIS_URL, prefix: "flags" });
 *
 * const { fetch } = createFetchHandler({
 *   sourceStorage: storage,
 *   basePath: "/flags",
 *   title: "My App Flags",
 * });
 *
 * Bun.serve({ port: 3000, fetch });
 * ```
 *
 * @module
 */

// Types & schema
export type {
  Actor,
  AuditEntry,
  Condition,
  ConditionGroup,
  ConditionNode,
  ConditionOperator,
  Draft,
  DurationUnit,
  FlagDuration,
  EnvironmentMeta,
  EvaluationContext,
  EvaluationDetail,
  EvaluationReason,
  Flag,
  FlagErrorCode,
  FlagOwner,
  FlagType,
  FlagValue,
  JsonValue,
  LifecycleExpiry,
  LifecyclePolicy,
  Override,
  Prerequisite,
  ProjectMeta,
  Rule,
  Segment,
  Serve,
  Snapshot,
  SplitEntry,
  Variant,
} from "./schema.ts";
export { isConditionGroup, leafConditions, SNAPSHOT_SCHEMA_VERSION } from "./schema.ts";

// Evaluator (zero-dep, request-path safe)
export {
  compareSemver,
  evaluateCondition,
  evaluateFlag,
  evaluateNode,
  matchesRule,
  pickVariant,
  resolveBucketingKey,
} from "./evaluator.ts";
export type { FlagEvaluation, SegmentMap, SplitInput } from "./evaluator.ts";

// Pluggable comparators for custom value-object types (request-path safe)
export { clearComparators, registerComparator, withComparators } from "./comparators.ts";
export type {
  ComparatorEntry,
  ComparatorHandlers,
  ComparatorPredicate,
  ComparatorRegistry,
  ComparatorResult,
} from "./comparators.ts";

// Pluggable query matchers backing matches/notMatches (request-path safe)
export {
  clearMatchers,
  DEFAULT_MATCHER,
  regexMatcher,
  registerMatcher,
  resolveMatcher,
  withMatchers,
} from "./matchers.ts";
export type { MatcherFn, MatcherRegistry } from "./matchers.ts";

// Hashing
export { hashToUnitInterval, murmur3 } from "./hash.ts";

// Snapshot model
export { compileDraft, nextVersion, SnapshotStore } from "./snapshot.ts";
export type { CompileOptions } from "./snapshot.ts";

// Lifecycle / staleness (organizational; not request-path)
export { flagStaleness, summarizeLifecycle } from "./lifecycle.ts";
export type { FlagStaleness, LifecycleSummary, StalenessOptions } from "./lifecycle.ts";

// Validation (admin path)
export {
  assertValidDraft,
  DraftValidationError,
  flagSchema,
  validateDraft,
  validateFlag,
  validatePrerequisiteGraph,
  validateSegment,
} from "./validation.ts";
export type { ValidationError, ValidationResult } from "./validation.ts";

// Reusable segments (resolved at compile time; not request-path)
export {
  inlineSegments,
  inlineSegmentsInFlag,
  referencedSegmentKeys,
  resolveSegments,
  SegmentResolutionError,
  usesEmbeddedSegments,
  usesNotInSegment,
  validateSegmentReferences,
} from "./segments.ts";
export type { SegmentReferenceError } from "./segments.ts";

// Storage contracts
export { isCompareAndSwap, isTransactional, isWatchable, requirePeer } from "./storage/contract.ts";
export type {
  CompareAndSwapFlagsStorage,
  FlagsStorage,
  StorageChangeEvent,
  TransactionalFlagsStorage,
  WatchableFlagsStorage,
} from "./storage/contract.ts";

// Storage key layout (advanced/custom adapters)
export * as keys from "./keys.ts";

// Auth & authorization contracts (implement your own)
export type { AuthProvider, Principal } from "./auth/contract.ts";
export type {
  AuthorizationProvider,
  AuthorizeInput,
  FlagsAction,
  FlagsResource,
} from "./authorization/contract.ts";
export { isMutatingAction, MUTATING_ACTIONS } from "./authorization/contract.ts";

// Admin core + server handler
export { createFlagsCore } from "./core.ts";
export type {
  EvaluateInput,
  FlagEvaluationResult,
  FlagsCore,
  FlagsCoreOptions,
  SnapshotSummary,
} from "./core.ts";
export { createFetchHandler } from "./server/create-fetch-handler.ts";
export type { CreateFetchHandlerResult, FlagsPanelOptions } from "./server/create-fetch-handler.ts";
export { buildOpenApiDocument } from "./server/openapi.ts";
export type { OpenApiOptions } from "./server/openapi.ts";
