/**
 * Subpath entry for `@xtandard/flags/match/sift`. Re-exports the sift-backed
 * query matcher so the bundler maps it to its own dist file (keeping `sift` out
 * of the zero-dep core).
 *
 * @module
 */

export * from "./sift-matcher.ts";
