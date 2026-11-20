/**
 * Publish test gate: `createTestGate` re-evaluates each flag's pinned test cases
 * against the draft about to be published and denies a publish that breaks them;
 * `runFlagTests` runs the cases directly. No dependencies.
 *
 * Entry point for the `@xtandard/flags/hooks/test-gate` subpath export.
 *
 * @module hooks/test-gate
 */

export * from "./hooks/test-gate.ts";
