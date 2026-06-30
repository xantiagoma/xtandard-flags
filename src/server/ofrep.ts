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

/** Extra flag metadata the server attaches to each OFREP evaluation. */
export interface OfrepMetaInput {
  /** Active snapshot version that produced the value (e.g. `"v3"`). */
  version?: string | null;
}

/** Build the OFREP `metadata` object from the result + server context. */
function buildMetadata(
  result: FlagEvaluationResult,
  meta: OfrepMetaInput,
): Record<string, string | number | boolean> {
  const metadata: Record<string, string | number | boolean> = {};
  if (meta.version) metadata.version = meta.version;
  if (result.flagType) metadata.flagType = result.flagType;
  return metadata;
}

/** Map one internal evaluation result to the OFREP shape. */
export function toOfrepEvaluation(
  result: FlagEvaluationResult,
  meta: OfrepMetaInput = {},
): OfrepEvaluation {
  const metadata = buildMetadata(result, meta);
  const out: OfrepEvaluation = { key: result.key, metadata };
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

/** The OFREP bulk response body. `eventStreams` advertises SSE endpoints (opt-in). */
export interface OfrepBulkResponse {
  flags: OfrepEvaluation[];
  eventStreams?: Array<{ url: string }>;
}

/** Build the OFREP bulk response body (`{ flags: [...] }`, plus optional `eventStreams`). */
export function toOfrepBulkResponse(
  results: FlagEvaluationResult[],
  meta: OfrepMetaInput = {},
  eventStreams?: Array<{ url: string }>,
): OfrepBulkResponse {
  const body: OfrepBulkResponse = { flags: results.map((r) => toOfrepEvaluation(r, meta)) };
  if (eventStreams && eventStreams.length > 0) body.eventStreams = eventStreams;
  return body;
}
