/**
 * Reusable-segment resolution.
 *
 * Segments are named, shareable audiences referenced by targeting rules via the
 * `inSegment` / `notInSegment` operators. A **single-key** `inSegment` is an
 * authoring convenience: this module inlines it into rule conditions at compile
 * time so the runtime evaluator never sees it. An **array** `inSegment` (OR across
 * segments) and `notInSegment` can't be inlined (negating/OR-ing a flat AND), so
 * the resolved segments are embedded in the snapshot and evaluated at runtime.
 * Pure and dependency-free — safe to use from the compile path.
 *
 * @module
 */

import type { Condition, Flag, Segment } from "./schema.ts";

/** Thrown when a segment reference cannot be resolved (missing or cyclic). */
export class SegmentResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SegmentResolutionError";
  }
}

/**
 * Expand a list of conditions, replacing every `inSegment` condition with the
 * referenced segment's conditions (recursively). The result is a flat AND list
 * with no `inSegment` operators left.
 *
 * @throws {SegmentResolutionError} if a referenced segment is missing or the
 * reference graph contains a cycle.
 */
function expandConditions(
  conditions: Condition[],
  segments: Record<string, Segment>,
  stack: string[],
): Condition[] {
  const out: Condition[] = [];
  for (const condition of conditions) {
    if (condition.operator !== "inSegment") {
      out.push(condition);
      continue;
    }
    // An array value is an OR across segments — it can't be inlined into a flat
    // AND list, so keep the condition for runtime evaluation against the embedded
    // segments (same path as `notInSegment`).
    if (Array.isArray(condition.value)) {
      out.push(condition);
      continue;
    }
    const segmentKey = typeof condition.value === "string" ? condition.value : "";
    if (!segmentKey) {
      throw new SegmentResolutionError(`inSegment condition is missing a segment key`);
    }
    if (stack.includes(segmentKey)) {
      throw new SegmentResolutionError(
        `cyclic segment reference: ${[...stack, segmentKey].join(" → ")}`,
      );
    }
    const segment = segments[segmentKey];
    if (!segment) {
      throw new SegmentResolutionError(`unknown segment "${segmentKey}"`);
    }
    out.push(...expandConditions(segment.conditions, segments, [...stack, segmentKey]));
  }
  return out;
}

/**
 * Return a copy of `flag` with all `inSegment` conditions in its rules inlined.
 * Flags without segment references are returned unchanged (same reference).
 */
export function inlineSegmentsInFlag(flag: Flag, segments: Record<string, Segment>): Flag {
  if (!flag.rules || flag.rules.length === 0) return flag;
  let changed = false;
  const rules = flag.rules.map((rule) => {
    if (!rule.conditions.some((c) => c.operator === "inSegment")) return rule;
    changed = true;
    return { ...rule, conditions: expandConditions(rule.conditions, segments, []) };
  });
  return changed ? { ...flag, rules } : flag;
}

/** Inline segments across every flag in a map. */
export function inlineSegments(
  flags: Record<string, Flag>,
  segments: Record<string, Segment>,
): Record<string, Flag> {
  const out: Record<string, Flag> = {};
  for (const [key, flag] of Object.entries(flags)) {
    out[key] = inlineSegmentsInFlag(flag, segments);
  }
  return out;
}

/** Segment keys named by a condition value (a single key string or an array of keys). */
function segmentKeysOfValue(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && !!v);
  return [];
}

/** Collect the segment keys referenced (directly) by a flag's rule conditions. */
export function referencedSegmentKeys(flag: Flag): string[] {
  const keys = new Set<string>();
  for (const rule of flag.rules ?? []) {
    for (const condition of rule.conditions) {
      if (condition.operator === "inSegment") {
        for (const k of segmentKeysOfValue(condition.value)) keys.add(k);
      }
    }
  }
  return [...keys];
}

/**
 * Resolve every segment for embedding in a snapshot: `inSegment` conditions are
 * inlined (so embedded segments hold only primitive + `notInSegment` conditions),
 * which is what {@link ./evaluator.evaluateFlag} needs to check membership.
 */
export function resolveSegments(segments: Record<string, Segment>): Record<string, Segment> {
  const out: Record<string, Segment> = {};
  for (const [key, segment] of Object.entries(segments)) {
    out[key] = { ...segment, conditions: expandConditions(segment.conditions, segments, [key]) };
  }
  return out;
}

/** True if any flag rule (after inlining) uses the `notInSegment` operator. */
export function usesNotInSegment(flags: Record<string, Flag>): boolean {
  for (const flag of Object.values(flags)) {
    for (const rule of flag.rules ?? []) {
      if (rule.conditions.some((c) => c.operator === "notInSegment")) return true;
    }
  }
  return false;
}

/**
 * True if any flag rule (after inlining) needs **embedded** segments at runtime —
 * i.e. uses `notInSegment`, or an `inSegment` with an **array** value (an OR across
 * segments, which can't be inlined). Single-key `inSegment` is inlined, so it
 * doesn't count.
 */
export function usesEmbeddedSegments(flags: Record<string, Flag>): boolean {
  for (const flag of Object.values(flags)) {
    for (const rule of flag.rules ?? []) {
      for (const c of rule.conditions) {
        if (c.operator === "notInSegment") return true;
        if (c.operator === "inSegment" && Array.isArray(c.value)) return true;
      }
    }
  }
  return false;
}

/** A single segment-reference problem, with a dotted path into the offending data. */
export interface SegmentReferenceError {
  path: string;
  message: string;
}

/**
 * Validate that every `inSegment` reference (across flags and nested segments)
 * resolves to an existing segment and that the reference graph is acyclic.
 * Returns an empty array when the references are sound.
 */
export function validateSegmentReferences(
  flags: Record<string, Flag>,
  segments: Record<string, Segment>,
): SegmentReferenceError[] {
  const errors: SegmentReferenceError[] = [];

  // 1. Nested segment graph: every referenced segment exists, no cycles.
  for (const [key, segment] of Object.entries(segments)) {
    try {
      expandConditions(segment.conditions, segments, [key]);
    } catch (err) {
      if (err instanceof SegmentResolutionError) {
        errors.push({ path: `segments.${key}`, message: err.message });
      } else throw err;
    }
  }

  // 2. Flag rules: every referenced segment resolves.
  for (const [flagKey, flag] of Object.entries(flags)) {
    (flag.rules ?? []).forEach((rule, i) => {
      try {
        expandConditions(rule.conditions, segments, []);
      } catch (err) {
        if (err instanceof SegmentResolutionError) {
          errors.push({ path: `flags.${flagKey}.rules[${i}]`, message: err.message });
        } else throw err;
      }
    });
  }

  // 3. References that aren't inlined by expandConditions — `notInSegment` and
  // array (`OR`) `inSegment` — are evaluated at runtime against embedded segments.
  // Check they point at existing segments. Cycles are safe at runtime (guarded),
  // so only dangling refs are an error.
  const checkNonInlined = (conditions: Condition[], path: string) => {
    conditions.forEach((c, i) => {
      const nonInlined =
        c.operator === "notInSegment" || (c.operator === "inSegment" && Array.isArray(c.value));
      if (!nonInlined) return;
      const keys = segmentKeysOfValue(c.value);
      if (keys.length === 0) {
        errors.push({ path: `${path}[${i}].value`, message: `unknown segment ""` });
      }
      for (const key of keys) {
        if (!segments[key]) {
          errors.push({ path: `${path}[${i}].value`, message: `unknown segment "${key}"` });
        }
      }
    });
  };
  for (const [flagKey, flag] of Object.entries(flags)) {
    (flag.rules ?? []).forEach((rule, i) =>
      checkNonInlined(rule.conditions, `flags.${flagKey}.rules[${i}].conditions`),
    );
  }
  for (const [key, segment] of Object.entries(segments)) {
    checkNonInlined(segment.conditions, `segments.${key}.conditions`);
  }

  return errors;
}
