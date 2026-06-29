/**
 * Compile-time type assertions for the public surface of `@xtandard/flags`.
 * Checked by `tsc --noEmit` (via `bun run typecheck` / `check`); NOT run by the
 * test runner — vitest's `*.test.ts` glob excludes `*.test-d.ts`. A failing
 * assertion is a type error, so the build fails. Mirrors `@xtandard/lib`.
 */
import type { Equal, Expect, Extends } from "type-testing";

import type {
  ConditionOperator,
  EvaluationContext,
  Flag,
  FlagType,
  FlagsStorage,
  Serve,
  WatchableFlagsStorage,
  AuthProvider,
  AuthorizationProvider,
  FlagsAction,
} from "../src/index.ts";
import { evaluateFlag, pickVariant, type FlagEvaluation } from "../src/evaluator.ts";
import { createFlagsCore, type FlagsCore, type FlagEvaluationResult } from "../src/core.ts";
import {
  createFetchHandler,
  type CreateFetchHandlerResult,
} from "../src/server/create-fetch-handler.ts";
import { buildOpenApiDocument } from "../src/server/openapi.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { basicAuth } from "../src/auth/basic.ts";
import { noAuth } from "../src/auth/none.ts";
import { delegatedAuth } from "../src/auth/delegated.ts";
import { rolesAuthorization } from "../src/authorization/roles.ts";
import { delegatedAuthorization } from "../src/authorization/delegated.ts";
import { booleanFlag, variantFlag } from "../src/testing.ts";

// ── Core unions are exactly what's documented ──────────────────────────────
export type _FlagType = Expect<Equal<FlagType, "boolean" | "string" | "number" | "json">>;

export type _ConditionOperator = Expect<
  Equal<
    ConditionOperator,
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
  >
>;

// ── Evaluator ──────────────────────────────────────────────────────────────
export type _EvaluateReturn = Expect<Equal<ReturnType<typeof evaluateFlag>, FlagEvaluation>>;
export type _PickVariantReturn = Expect<Equal<ReturnType<typeof pickVariant>, string | undefined>>;
// `value` is intentionally `undefined`-able (only on ERROR) — guard against regressions.
export type _EvalValueOptional = Expect<Extends<undefined, FlagEvaluation["value"]>>;

// ── Serve is the fixed-variant | weighted-split union ──────────────────────
export type _ServeFixed = Expect<Extends<{ variant: "on" }, Serve>>;
export type _ServeSplit = Expect<Extends<{ split: { variant: "on"; weight: 50 }[] }, Serve>>;

// ── EvaluationContext accepts targetingKey + arbitrary attributes ──────────
export type _Ctx = Expect<Extends<{ targetingKey: string; country: string }, EvaluationContext>>;

// ── Admin core ─────────────────────────────────────────────────────────────
export type _CoreReturn = Expect<Equal<ReturnType<typeof createFlagsCore>, FlagsCore>>;
export type _EvaluateCore = Expect<
  Equal<ReturnType<FlagsCore["evaluate"]>, Promise<FlagEvaluationResult[]>>
>;

// ── Server handler shape (incl. openapi()) ─────────────────────────────────
export type _HandlerReturn = Expect<
  Equal<ReturnType<typeof createFetchHandler>, CreateFetchHandlerResult>
>;
export type _HandlerHasOpenapi = Expect<
  Equal<ReturnType<CreateFetchHandlerResult["openapi"]>, Record<string, unknown>>
>;
export type _OpenApiReturn = Expect<
  Equal<ReturnType<typeof buildOpenApiDocument>, Record<string, unknown>>
>;

// ── Storage adapters satisfy the contract ──────────────────────────────────
export type _MemoryIsWatchable = Expect<
  Extends<ReturnType<typeof createMemoryStorage>, WatchableFlagsStorage>
>;
export type _MemoryIsStorage = Expect<
  Extends<ReturnType<typeof createMemoryStorage>, FlagsStorage>
>;
// Bring-your-own storage: any object matching the contract is accepted.
type ByoStorage = {
  getItem<T>(k: string): Promise<T | null>;
  setItem<T>(k: string, v: T): Promise<void>;
  removeItem(k: string): Promise<void>;
  getKeys(p: string): Promise<string[]>;
};
export type _ByoStorage = Expect<Extends<ByoStorage, FlagsStorage>>;

// ── Auth / authorization built-ins implement their contracts ───────────────
export type _BasicAuth = Expect<Extends<ReturnType<typeof basicAuth>, AuthProvider>>;
export type _NoAuth = Expect<Extends<ReturnType<typeof noAuth>, AuthProvider>>;
export type _DelegatedAuth = Expect<Extends<ReturnType<typeof delegatedAuth>, AuthProvider>>;
export type _RolesAuthz = Expect<
  Extends<ReturnType<typeof rolesAuthorization>, AuthorizationProvider>
>;
export type _DelegatedAuthz = Expect<
  Extends<ReturnType<typeof delegatedAuthorization>, AuthorizationProvider>
>;
export type _FlagsActionHasFlagRead = Expect<Extends<"flag:read", FlagsAction>>;

// ── Testing helpers produce Flags ──────────────────────────────────────────
export type _BooleanFlag = Expect<Equal<ReturnType<typeof booleanFlag>, Flag>>;
export type _VariantFlag = Expect<Equal<ReturnType<typeof variantFlag>, Flag>>;
