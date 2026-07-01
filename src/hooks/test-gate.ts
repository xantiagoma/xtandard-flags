/**
 * `@xtandard/flags/hooks/test-gate` — gate publishing on pinned flag tests.
 *
 * A `before` hook on the `publish` event that re-evaluates every flag carrying
 * {@link ../schema.Flag.tests} against the *draft about to be published* and
 * **denies the publish** if any case regresses. Turns "did I break targeting?"
 * from a post-deploy surprise into a pre-publish gate — leaning entirely on the
 * pure evaluator.
 *
 * @example
 * ```ts
 * import { createFetchHandler } from "@xtandard/flags";
 * import { createTestGate } from "@xtandard/flags/hooks/test-gate";
 *
 * createFetchHandler({ sourceStorage, hooks: createTestGate() });
 *
 * // A flag pins expectations:
 * // {
 * //   key: "checkout", type: "string", ...,
 * //   tests: [
 * //     { name: "enterprise sees new flow",
 * //       context: { targetingKey: "u1", plan: "enterprise" },
 * //       expect: { variant: "new" } },
 * //   ],
 * // }
 * ```
 *
 * @module
 */

import { evaluateFlag } from "../evaluator.ts";
import { inlineSegmentsInFlag, resolveSegments } from "../segments.ts";
import { tryCatchSync } from "../try-catch.ts";
import type { Flag, FlagValue, Segment } from "../schema.ts";
import type { BeforeEvent, FlagsHooks } from "./contract.ts";
import { HookDeniedError } from "./contract.ts";

/** A single failed pinned test, produced by {@link runFlagTests}. */
export interface TestFailure {
  flagKey: string;
  /** Test index within the flag's `tests` array. */
  index: number;
  name?: string;
  /** Human-readable "expected X, got Y" message. */
  message: string;
}

/** Options for {@link createTestGate}. */
export interface TestGateOptions {
  /**
   * HTTP status the denial maps to at the API layer. Default `422`
   * (Unprocessable — the draft is well-formed but fails its own tests).
   */
  status?: number;
}

const fmt = (v: unknown): string =>
  typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);

/** Structural deep-equality for `json` flag values (order-sensitive on objects). */
const valueEquals = (a: FlagValue | undefined, b: FlagValue | undefined): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Evaluate every pinned test in `flags` against the draft (segments resolved +
 * inlined the same way {@link ../core.FlagsCore.evaluate} does for a draft) and
 * return the failures. Pure — no I/O — so it is easy to unit-test and reuse.
 */
export function runFlagTests(
  flags: Record<string, Flag>,
  segments: Record<string, Segment>,
): TestFailure[] {
  const [resolved] = tryCatchSync(() => resolveSegments(segments));
  const resolvedSegments = resolved ?? {};

  // Inline segment references per flag; a dangling/cyclic ref fails every test
  // for that flag (the publish would fail compilation anyway).
  const inlined: Record<string, Flag> = {};
  const inlineFailed = new Set<string>();
  for (const [key, flag] of Object.entries(flags)) {
    const [ok, err] = tryCatchSync(() => inlineSegmentsInFlag(flag, segments));
    if (err) inlineFailed.add(key);
    else inlined[key] = ok!;
  }

  const failures: TestFailure[] = [];
  for (const [key, flag] of Object.entries(flags)) {
    if (!flag.tests?.length) continue;
    flag.tests.forEach((t, index) => {
      const base = { flagKey: key, index, name: t.name };
      if (inlineFailed.has(key)) {
        failures.push({ ...base, message: "flag has an unresolved segment reference" });
        return;
      }
      const r = evaluateFlag(inlined[key]!, t.context, inlined, resolvedSegments);
      if (t.expect.variant !== undefined && r.variant !== t.expect.variant) {
        failures.push({
          ...base,
          message: `expected variant "${t.expect.variant}", got "${r.variant}" (${r.reason})`,
        });
      }
      if (t.expect.value !== undefined && !valueEquals(r.value, t.expect.value)) {
        failures.push({
          ...base,
          message: `expected value ${fmt(t.expect.value)}, got ${fmt(r.value)} (${r.reason})`,
        });
      }
    });
  }
  return failures;
}

/** Format failures into a single denial message. */
function describe(failures: TestFailure[]): string {
  const lines = failures.map((f) => {
    const label = f.name ? `"${f.name}"` : `#${f.index}`;
    return `  - ${f.flagKey} ${label}: ${f.message}`;
  });
  return `Publish blocked — ${failures.length} flag test(s) failed:\n${lines.join("\n")}`;
}

/**
 * Build a `before` hook that runs pinned flag tests on publish and throws
 * {@link HookDeniedError} (default status `422`) listing any regressions.
 */
export function createTestGate(options: TestGateOptions = {}): FlagsHooks {
  const status = options.status ?? 422;
  return {
    before(event: BeforeEvent) {
      if (event.type !== "publish") return;
      const failures = runFlagTests(event.draft.flags, event.segments);
      if (failures.length > 0) throw new HookDeniedError(describe(failures), { status });
    },
  };
}
