/**
 * A ready-made {@link ./matchers.MatcherFn} backed by
 * [sift](https://github.com/crcn/sift.js) — MongoDB-style query operators
 * (`$gt`, `$in`, `$or`, `$and`, `$not`, `$regex`, …) over the subject.
 *
 * `sift` is an optional peer dependency: install it only if you use this adapter.
 * The core package stays zero-dep; this module is reached only via the
 * `@xtandard/flags/match/sift` subpath.
 *
 * @example
 * ```ts
 * import { registerMatcher } from "@xtandard/flags";
 * import { siftMatcher } from "@xtandard/flags/match/sift";
 *
 * registerMatcher("sift", siftMatcher);
 * // or as the default so conditions can omit `matcher`:
 * registerMatcher("default", siftMatcher);
 * ```
 *
 * @module
 */

import sift from "sift";
import { registerMatcher, type MatcherFn } from "./matchers.ts";

/**
 * Match a sift/Mongo-style query document against the subject. Build/evaluation
 * errors (e.g. an unsupported operator) propagate to the evaluator, which wraps
 * the call and fails the condition closed.
 */
export const siftMatcher: MatcherFn = (query, subject) => {
  const test = sift(query as Parameters<typeof sift>[0]);
  return test(subject) === true;
};

/**
 * Convenience registration: register {@link siftMatcher} on the process-wide
 * registry under `name` (default `"sift"`). Returns the dispose function from
 * {@link ./matchers.registerMatcher}.
 *
 * Pass `"default"` to make it the matcher used when a condition omits `matcher`.
 */
export function registerSiftMatcher(name = "sift"): () => void {
  return registerMatcher(name, siftMatcher);
}
