/**
 * Tiny `try/catch` → `Result` tuple helper, so possibly-throwing coercions read
 * as a value/error pair instead of nested try blocks. Dependency-free and
 * request-path safe (mirrors the `tryCatchSync` convention from `@xtandard/lib`,
 * inlined here to avoid a runtime dependency).
 *
 * @module
 */

/** Success `[value, null]` or failure `[null, error]`. */
export type Result<T, E = Error> = [T, null] | [null, E];

/**
 * Run `fn`, returning `[value, null]` on success or `[null, error]` if it throws.
 *
 * @example
 * ```ts
 * const [n, err] = tryCatchSync(() => JSON.parse(input));
 * if (err) return fallback;
 * ```
 */
export function tryCatchSync<T, E = Error>(fn: () => T): Result<T, E> {
  try {
    return [fn(), null];
  } catch (error) {
    return [null, error as E];
  }
}
