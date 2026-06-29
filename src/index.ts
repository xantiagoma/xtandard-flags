/**
 * `@xtandard/flags` — public surface.
 *
 * Re-exports the core contracts, types, evaluator, snapshot model, and the
 * admin/server factories. Storage/auth/authorization/adapter implementations
 * live behind their own subpath exports (e.g. `@xtandard/flags/storage/redis`).
 *
 * @module
 */

// Types & schema
export type {
  Actor,
  AuditEntry,
  Condition,
  ConditionOperator,
  Draft,
  EnvironmentMeta,
  EvaluationContext,
  EvaluationDetail,
  EvaluationReason,
  Flag,
  FlagErrorCode,
  FlagType,
  FlagValue,
  JsonValue,
  Override,
  ProjectMeta,
  Rule,
  Serve,
  Snapshot,
  SplitEntry,
  Variant,
} from "./schema.ts";
export { SNAPSHOT_SCHEMA_VERSION } from "./schema.ts";

// Evaluator (zero-dep, request-path safe)
export {
  compareSemver,
  evaluateCondition,
  evaluateFlag,
  matchesRule,
  pickVariant,
  resolveBucketingKey,
} from "./evaluator.ts";
export type { FlagEvaluation, SplitInput } from "./evaluator.ts";

// Hashing
export { hashToUnitInterval, murmur3 } from "./hash.ts";

// Snapshot model
export { compileDraft, nextVersion, SnapshotStore } from "./snapshot.ts";
export type { CompileOptions } from "./snapshot.ts";

// Validation (admin path)
export {
  assertValidDraft,
  DraftValidationError,
  flagSchema,
  validateDraft,
  validateFlag,
} from "./validation.ts";
export type { ValidationError, ValidationResult } from "./validation.ts";

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
export type { FlagsCore, FlagsCoreOptions, SnapshotSummary } from "./core.ts";
export { createFetchHandler } from "./server/create-fetch-handler.ts";
export type { CreateFetchHandlerResult, FlagsPanelOptions } from "./server/create-fetch-handler.ts";
