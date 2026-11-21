/**
 * The sift query matcher for the `matches` / `notMatches` condition operators
 * (MongoDB-style query documents): `siftMatcher`, and `registerSiftMatcher` to
 * register it by name. Optional peer dependency: `sift`.
 *
 * Subpath entry for `@xtandard/flags/match/sift`. Re-exports the sift-backed
 * query matcher so the bundler maps it to its own dist file (keeping `sift` out
 * of the zero-dep core).
 *
 * @module match/sift
 */

export * from "./sift-matcher.ts";
