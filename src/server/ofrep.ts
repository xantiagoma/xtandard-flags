/**
 * OpenFeature Remote Evaluation Protocol (OFREP) payload shaping.
 *
 * OFREP lets client/edge SDKs that cannot evaluate in-process fetch resolved
 * flags over HTTP. This module maps our {@link FlagEvaluationResult} to the
 * OFREP wire shape; the HTTP routes live in {@link ./routes}.
 *
 * **Caveat:** serving evaluation from the control plane partly conflicts with
 * the project's "admin is never in the request path" promise. OFREP is an
 * OPT-IN convenience — the in-process {@link ../openfeature.createOpenFeatureProvider}
 * remains the recommended path. See `docs/ADR/0004-ofrep-endpoint.md`.
 *
 * @module
 */

import { toOpenFeatureReason } from "../openfeature.ts";
import type { FlagEvaluationResult } from "../core.ts";

/** A single OFREP flag evaluation (success or error), per the OFREP schema. */
export interface OfrepEvaluation {
  key: string;
  value?: unknown;
  variant?: string;
  reason?: string;
  errorCode?: string;
  errorDetails?: string;
  metadata: Record<string, string | number | boolean>;
}

/** Map one internal evaluation result to the OFREP shape. */
export function toOfrepEvaluation(result: FlagEvaluationResult): OfrepEvaluation {
  const out: OfrepEvaluation = { key: result.key, metadata: {} };
  if (result.reason === "ERROR" || result.value === undefined) {
    out.errorCode = result.errorCode ?? "GENERAL";
    out.errorDetails = `evaluation of "${result.key}" produced no value`;
    return out;
  }
  out.value = result.value;
  out.reason = toOpenFeatureReason(result.reason);
  if (result.variant !== undefined) out.variant = result.variant;
  return out;
}

/** Build the OFREP bulk response body (`{ flags: [...] }`). */
export function toOfrepBulkResponse(results: FlagEvaluationResult[]): { flags: OfrepEvaluation[] } {
  return { flags: results.map(toOfrepEvaluation) };
}
