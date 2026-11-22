/**
 * `@xtandard/flags/hooks/log` — a reference hook that logs mutation events.
 *
 * The simplest possible consumer of the hooks seam: useful as a starting point
 * for your own `after` side effects, and handy for local debugging or piping
 * admin activity to a log aggregator. Zero dependencies.
 *
 * @example
 * ```ts
 * import { createFetchHandler } from "@xtandard/flags";
 * import { createLogHook } from "@xtandard/flags/hooks/log";
 *
 * createFetchHandler({ sourceStorage, hooks: createLogHook() });
 * ```
 *
 * @module
 */

import * as kit from "@xtandard/kit/hooks/log";
import type { AfterEvent, BeforeEvent, FlagsHooks } from "./contract.ts";

/**
 * Options for {@link createLogHook}: `log` (default `console.log`),
 * `includeBefore`, `json` (one JSON object per line) and `format`. The default
 * line is `[@xtandard/flags] <phase> <type> <project>/<env> <JSON payload>`.
 */
export type LogHookOptions = kit.LogHookOptions<BeforeEvent, AfterEvent>;

/**
 * Build a hook that logs each mutation event. Never throws from `before`, so it
 * never denies a mutation — it is a pure observer.
 */
export function createLogHook(options: LogHookOptions = {}): FlagsHooks {
  return kit.createLogHook<BeforeEvent, AfterEvent>({
    source: "@xtandard/flags",
    describe: (event) => `${event.projectKey}/${event.environmentKey}`,
    ...options,
  });
}
