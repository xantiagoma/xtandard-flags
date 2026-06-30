/**
 * Pluggable comparators for **value-object types that don't follow the
 * static-`compare`/static-`from` convention** the evaluator duck-types in
 * {@link ./evaluator}. Register a predicate plus a `compare` (and optionally a
 * `parser`) and the ordering operators (`>`/`>=`/`<`/`<=`) and equality
 * (`equals`/`in`/…) learn the type — e.g. Dinero.js, Decimal.js, BigNumber.
 *
 * The whole mechanism is **request-path safe**: zero deps, never throws. A
 * predicate or `compare` that throws fails the operand pair *closed* (the
 * condition does not match) rather than propagating.
 *
 * Two layers, mirroring the "global default + per-instance override" model:
 *  - {@link registerComparator} mutates a process-wide default registry consulted
 *    by every evaluation (including the bare {@link ./evaluator.evaluateFlag}).
 *  - {@link withComparators} scopes an instance registry (from a provider/core
 *    `comparators` option) over the global default for one synchronous evaluation.
 *
 * @example
 * ```ts
 * import { registerComparator } from "@xtandard/flags";
 * import { dinero, lessThan, equal, type Dinero } from "dinero.js";
 *
 * const isDinero = (v: unknown): v is Dinero<number> =>
 *   typeof v === "object" && v !== null && "calculator" in v && "toJSON" in v;
 *
 * registerComparator(isDinero, {
 *   compare: (a, b) => (equal(a, b) ? 0 : lessThan(a, b) ? -1 : 1),
 *   parser: (raw) => dinero(raw as Parameters<typeof dinero>[0]),
 * });
 * ```
 *
 * @module
 */

import { tryCatchSync } from "./try-catch.ts";

/** Tests whether a value belongs to a custom comparable type. Should never throw, but is called defensively. */
export type ComparatorPredicate = (value: unknown) => boolean;

/** How to order (and optionally coerce) values of a custom comparable type. */
export interface ComparatorHandlers {
  /**
   * Order two values of the matched type: negative if `a < b`, `0` if equal,
   * positive if `a > b`. May throw — a throw is treated as "not comparable" and
   * fails the condition closed.
   */
  compare: (a: unknown, b: unknown) => number;
  /**
   * Optional: lift the *other* operand (the one the predicate did not match,
   * typically the JSON-stored condition value) into the comparable type before
   * {@link ComparatorHandlers.compare}. May throw; on failure the original
   * operand is passed through unchanged.
   */
  parser?: (raw: unknown) => unknown;
}

/** A single registry entry: a predicate paired with its handlers. */
export type ComparatorEntry = readonly [ComparatorPredicate, ComparatorHandlers];

/**
 * A set of comparator entries. A `Map<predicate, handlers>` (as the natural
 * "keyed by predicate" shape) or any iterable of `[predicate, handlers]` tuples.
 */
export type ComparatorRegistry = Iterable<ComparatorEntry>;

/** The process-wide default registry. */
const globalEntries: ComparatorEntry[] = [];

/** Instance registry active for the current synchronous evaluation, if any. */
let scopedEntries: ComparatorEntry[] | undefined;

/** Entries consulted right now: the scoped set when inside {@link withComparators}, else the global default. */
function activeEntries(): readonly ComparatorEntry[] {
  return scopedEntries ?? globalEntries;
}

/**
 * Register a comparator on the process-wide default registry. Consulted by every
 * evaluation, including the bare {@link ./evaluator.evaluateFlag}. Later
 * registrations take precedence (first match wins on lookup).
 *
 * @returns A function that unregisters this entry.
 */
export function registerComparator(
  predicate: ComparatorPredicate,
  handlers: ComparatorHandlers,
): () => void {
  const entry: ComparatorEntry = [predicate, handlers];
  // Unshift so the most-recently-registered comparator wins on overlap.
  globalEntries.unshift(entry);
  return () => {
    const i = globalEntries.indexOf(entry);
    if (i >= 0) globalEntries.splice(i, 1);
  };
}

/** Remove all globally-registered comparators. Primarily for test isolation. */
export function clearComparators(): void {
  globalEntries.length = 0;
}

/** Normalise a {@link ComparatorRegistry} (Map or tuple iterable) to an array. */
function toEntries(registry: ComparatorRegistry): ComparatorEntry[] {
  return Array.from(registry);
}

/**
 * Run `fn` with `registry` layered **over** the global default for the duration
 * of the (synchronous) call. Instance entries take precedence over global ones.
 * Restores the previous scope in a `finally`, so nesting and throws are safe.
 *
 * Relies on evaluation being fully synchronous between the scope set and its use
 * — there is no `await` inside the evaluator — so this acts as a poor-man's
 * dynamic scope without leaking across async boundaries.
 */
export function withComparators<T>(registry: ComparatorRegistry | undefined, fn: () => T): T {
  if (registry === undefined) return fn();
  const previous = scopedEntries;
  scopedEntries = [...toEntries(registry), ...globalEntries];
  try {
    return fn();
  } finally {
    scopedEntries = previous;
  }
}

/** Outcome of consulting the registry for a pair of operands. */
export interface ComparatorResult {
  /** A registered comparator's predicate matched at least one operand. */
  matched: boolean;
  /** `-1 | 0 | 1` when the matched comparator produced a finite order; `undefined` if it threw or returned non-finite. */
  order?: -1 | 0 | 1;
}

const truthy = (predicate: ComparatorPredicate, v: unknown): boolean =>
  tryCatchSync(() => predicate(v))[0] === true;

/**
 * Order `a` against `b` using the first registered comparator whose predicate
 * matches either operand. When a `parser` is provided, the non-matching operand
 * is lifted to the comparable type first (e.g. a JSON-stored condition value
 * parsed back into a Dinero). Never throws.
 *
 * `matched: true` is final: if the matched comparator throws (or returns a
 * non-finite number), the result is `{ matched: true }` with no `order`, so the
 * caller fails the condition closed rather than falling through to numeric
 * coercion that would misread the value object.
 */
export function compareViaComparators(a: unknown, b: unknown): ComparatorResult {
  for (const [predicate, handlers] of activeEntries()) {
    const matchA = truthy(predicate, a);
    const matchB = truthy(predicate, b);
    if (!matchA && !matchB) continue;

    let lhs: unknown = a;
    let rhs: unknown = b;
    if (handlers.parser) {
      if (matchA && !matchB) {
        const [parsed] = tryCatchSync(() => handlers.parser!(b));
        if (parsed !== undefined) rhs = parsed;
      } else if (matchB && !matchA) {
        const [parsed] = tryCatchSync(() => handlers.parser!(a));
        if (parsed !== undefined) lhs = parsed;
      }
    }

    const [c] = tryCatchSync(() => handlers.compare(lhs, rhs));
    if (typeof c === "number" && Number.isFinite(c)) {
      return { matched: true, order: Math.sign(c) as -1 | 0 | 1 };
    }
    return { matched: true };
  }
  return { matched: false };
}
