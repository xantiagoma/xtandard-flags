/**
 * Evaluation sink — a **runtime-plane** observation hook, fired once per flag
 * evaluation. Deliberately separate from the admin-plane {@link ./hooks/contract.FlagsHooks}
 * (`before`/`after` around mutations):
 *
 * - **Different plane.** Admin hooks live on the core (publish/rollback/edits —
 *   rare, human-driven). Evaluation happens in the runtime provider + OFREP
 *   server, which only read published snapshots.
 * - **Hot path.** Evaluations can run thousands/sec on the request path, so the
 *   sink is **fire-and-forget**: it is invoked *after* the value is resolved,
 *   never awaited, and its errors never propagate into the evaluation result.
 *
 * It exists to feed usage/exposure pipelines — usage-driven stale detection
 * ("not evaluated in N days"), exposure export to analytics, per-flag metrics —
 * without a stats engine. Not OpenFeature's client-side Hooks (those wrap a
 * single SDK call); this observes server-side evaluations.
 *
 * @module
 */

import type { EvaluationContext, FlagValue } from "./schema.ts";

/** One resolved evaluation, delivered to an {@link EvaluationListener}. */
export interface EvaluationEvent {
  flagKey: string;
  /** The resolved value (the caller's default on error). */
  value: FlagValue | undefined;
  /** The resolved variant key, when known. */
  variant?: string;
  /** The outcome reason as surfaced to the caller (e.g. `TARGETING_MATCH`, `ERROR`). */
  reason: string;
  /** An error code when the evaluation did not resolve normally. */
  errorCode?: string;
  /** The evaluation context (targeting key + attributes). */
  context: EvaluationContext;
  projectKey: string;
  environmentKey: string;
  /** Where the evaluation came from: the in-process provider or the OFREP HTTP endpoint. */
  source: "provider" | "ofrep";
  /** ISO-8601 timestamp of the evaluation. */
  at: string;
}

/**
 * A fire-and-forget observer of evaluations. Return value (including a Promise)
 * is ignored by the caller; throwing / rejecting never affects the evaluation —
 * failures are routed to the configured error reporter.
 */
export type EvaluationListener = (event: EvaluationEvent) => void | Promise<void>;

/** Reports an error thrown/rejected by an {@link EvaluationListener}. */
export type EvaluationErrorReporter = (error: unknown, event: EvaluationEvent) => void;

/**
 * Invoke `listener` safely off the evaluation return path: synchronous throws
 * are caught and a returned Promise's rejection is handled, so a broken sink can
 * never fail (or slow, since it is not awaited) an evaluation.
 */
export function emitEvaluation(
  listener: EvaluationListener,
  event: EvaluationEvent,
  onError?: EvaluationErrorReporter,
): void {
  try {
    const result = listener(event);
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).catch((error) => onError?.(error, event));
    }
  } catch (error) {
    onError?.(error, event);
  }
}
