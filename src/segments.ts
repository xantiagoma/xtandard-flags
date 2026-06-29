/**
 * Reusable-segment resolution.
 *
 * Segments are named, shareable audiences referenced by targeting rules via the
 * `inSegment` condition operator. They are an **authoring** convenience only:
 * this module inlines them into rule conditions at compile time so the runtime
 * evaluator (and the compiled snapshot) never see `inSegment`. Pure and
 * dependency-free — safe to use from the compile path.
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

/** Collect the segment keys referenced (directly) by a flag's rule conditions. */
export function referencedSegmentKeys(flag: Flag): string[] {
  const keys = new Set<string>();
  for (const rule of flag.rules ?? []) {
    for (const condition of rule.conditions) {
      if (condition.operator === "inSegment" && typeof condition.value === "string") {
        keys.add(condition.value);
      }
    }
  }
  return [...keys];
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

  return errors;
}
