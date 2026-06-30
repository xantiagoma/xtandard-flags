/**
 * Pluggable **query matchers** backing the `matches` / `notMatches` operators.
 * Where {@link ./comparators} answers "how do two values order/equal", a matcher
 * answers "does this **query document** match the context?" — letting a single
 * condition express arbitrary boolean logic (AND/OR/NOT, nesting, sub-paths) that
 * the flat-AND rule model can't.
 *
 * The query is plain JSON (e.g. a [sift](https://github.com/crcn/sift.js) /
 * [mingo](https://github.com/kofrasa/mingo) MongoDB-style filter), so it stores in
 * the snapshot like any other condition `value`. The matching **engine** is *not*
 * bundled — it's a function you register (keyed by name), so the request path stays
 * zero-dep. The condition records which matcher by name (`condition.matcher`,
 * defaulting to {@link DEFAULT_MATCHER}); evaluation is in-process and never throws
 * (an unregistered matcher or a thrown query fails the condition **closed**).
 *
 * Note: schema validators (zod/valibot/arktype) are **code**, not JSON, so they
 * can't be a stored `value`. To use one, register a named matcher that closes over
 * the schema in code and have the condition reference it by name — same mechanism,
 * the query `value` just carries whatever (if any) params the matcher needs.
 *
 * Two layers, like comparators: {@link registerMatcher} populates a process-wide
 * registry; {@link withMatchers} scopes an instance registry (a provider/core
 * `matchers` option) over it for one synchronous evaluation.
 *
 * @example
 * ```ts
 * import { registerMatcher } from "@xtandard/flags";
 * import { siftMatcher } from "@xtandard/flags/match/sift";
 *
 * registerMatcher("sift", siftMatcher);
 * // condition: { operator: "matches", matcher: "sift", value: { plan: "pro", seats: { $gt: 10 } } }
 * ```
 *
 * @module
 */

import type { EvaluationContext, JsonValue } from "./schema.ts";

/** Matcher name used when a condition omits `matcher`. */
export const DEFAULT_MATCHER = "default";

/**
 * Decides whether a `matches`/`notMatches` condition is satisfied.
 *
 * @param query The condition's `value` — a JSON query document.
 * @param subject What to match against: `context[attribute]` when the condition
 *   names an attribute, otherwise the whole {@link EvaluationContext}.
 * @param context The full evaluation context (always provided, for matchers that
 *   want cross-attribute access regardless of `subject`).
 * @returns `true` if the query matches. May throw — a throw fails the condition
 *   closed (treated as "no clean result").
 */
export type MatcherFn = (query: JsonValue, subject: unknown, context: EvaluationContext) => boolean;

/**
 * A set of named matchers: a `Map<name, fn>`, a plain `Record<name, fn>`, or any
 * iterable of `[name, fn]` tuples.
 */
export type MatcherRegistry =
  | Map<string, MatcherFn>
  | Record<string, MatcherFn>
  | Iterable<readonly [string, MatcherFn]>;

/**
 * Built-in, zero-dep matcher backing the `"regex"` name out of the box. The query
 * is `{ pattern: string, flags?: string }`; the subject (an attribute value, or
 * the whole context) is coerced with `String()` and tested against the `RegExp`.
 * A bad pattern throws → the evaluator fails the condition closed.
 *
 * Uses the native `RegExp`, so it needs no dependency. For compile-time-typed
 * patterns you can register your own matcher built on a library like
 * [ts-regexp](https://github.com/codpro2005/ts-regexp).
 *
 * @example
 * ```ts
 * // { operator: "matches", matcher: "regex", attribute: "email",
 * //   value: { pattern: "@example\\.com$", flags: "i" } }
 * ```
 */
export const regexMatcher: MatcherFn = (query, subject) => {
  const q = query as { pattern?: unknown; flags?: unknown };
  if (typeof q.pattern !== "string") return false;
  const re = new RegExp(q.pattern, typeof q.flags === "string" ? q.flags : undefined);
  return re.test(String(subject));
};

/** Always-available matchers, consulted as a final fallback. Not cleared by {@link clearMatchers}. */
const builtinMatchers = new Map<string, MatcherFn>([["regex", regexMatcher]]);

/** The process-wide, user-populated registry (overrides built-ins by name). */
const globalMatchers = new Map<string, MatcherFn>();

/** Instance registry active for the current synchronous evaluation, if any. */
let scopedMatchers: Map<string, MatcherFn> | undefined;

/** Normalise any {@link MatcherRegistry} shape to a `Map`. */
function toMatcherMap(registry: MatcherRegistry): Map<string, MatcherFn> {
  if (registry instanceof Map) return new Map(registry);
  if (Symbol.iterator in Object(registry)) {
    return new Map(registry as Iterable<readonly [string, MatcherFn]>);
  }
  return new Map(Object.entries(registry as Record<string, MatcherFn>));
}

/**
 * Register a query matcher on the process-wide default registry under `name`
 * (re-registering a name replaces it). Consulted by every evaluation, including
 * the bare {@link ./evaluator.evaluateFlag}.
 *
 * @returns A function that unregisters this matcher (only if still the same fn).
 */
export function registerMatcher(name: string, fn: MatcherFn): () => void {
  globalMatchers.set(name, fn);
  return () => {
    if (globalMatchers.get(name) === fn) globalMatchers.delete(name);
  };
}

/** Remove all globally-registered matchers. Primarily for test isolation. */
export function clearMatchers(): void {
  globalMatchers.clear();
}

/**
 * Run `fn` with `registry` layered **over** the global default for the duration of
 * the (synchronous) call; instance matchers shadow global ones of the same name.
 * Restores the previous scope in a `finally`. Safe because the evaluator never
 * `await`s between the scope set and its use.
 */
export function withMatchers<T>(registry: MatcherRegistry | undefined, fn: () => T): T {
  if (registry === undefined) return fn();
  const previous = scopedMatchers;
  scopedMatchers = new Map(globalMatchers);
  for (const [name, matcher] of toMatcherMap(registry)) scopedMatchers.set(name, matcher);
  try {
    return fn();
  } finally {
    scopedMatchers = previous;
  }
}

/**
 * Resolve a matcher by name. Lookup order: the active scope (instance + global,
 * inside {@link withMatchers}) → the global registry → the always-available
 * {@link builtinMatchers} (e.g. `"regex"`). User registrations shadow built-ins.
 */
export function resolveMatcher(name: string): MatcherFn | undefined {
  return (scopedMatchers ?? globalMatchers).get(name) ?? builtinMatchers.get(name);
}
