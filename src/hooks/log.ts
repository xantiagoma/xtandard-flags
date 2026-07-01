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

import type { AfterEvent, BeforeEvent, FlagsHooks } from "./contract.ts";

/** Options for {@link createLogHook}. */
export interface LogHookOptions {
  /** Sink for each formatted line. Default: `console.log`. */
  log?: (line: string) => void;
  /** Also log `before` events (default `false` — `after` only). */
  includeBefore?: boolean;
  /**
   * Format a line for an event. Default: a compact
   * `[@xtandard/flags] <phase> <type> <project>/<env>` prefix + JSON payload.
   */
  format?: (phase: "before" | "after", event: BeforeEvent | AfterEvent) => string;
}

const defaultFormat = (phase: "before" | "after", event: BeforeEvent | AfterEvent): string =>
  `[@xtandard/flags] ${phase} ${event.type} ${event.projectKey}/${event.environmentKey} ${JSON.stringify(event)}`;

/**
 * Build a hook that logs each mutation event. Never throws from `before`, so it
 * never denies a mutation — it is a pure observer.
 */
export function createLogHook(options: LogHookOptions = {}): FlagsHooks {
  const log = options.log ?? ((line: string) => console.log(line));
  const format = options.format ?? defaultFormat;
  const hook: FlagsHooks = {
    after(event) {
      log(format("after", event));
    },
  };
  if (options.includeBefore) {
    hook.before = (event) => {
      log(format("before", event));
    };
  }
  return hook;
}
