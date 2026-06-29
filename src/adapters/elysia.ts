/**
 * Elysia adapter. `Elysia.mount` accepts a web-standard `(Request) => Response`
 * handler, so this returns exactly that — no `elysia` import required.
 *
 * ```ts
 * import { Elysia } from "elysia";
 * import { flagsPanel } from "@xtandard/flags/elysia";
 * new Elysia().mount("/flags", flagsPanel({ basePath: "/flags", sourceStorage }));
 * ```
 *
 * @module
 */

import { createFetchHandler, type FlagsPanelOptions } from "../server/create-fetch-handler.ts";

/** A web-standard fetch handler with the admin `core` attached for convenience. */
export type ElysiaFlagsHandler = ((request: Request) => Promise<Response>) & {
  core: ReturnType<typeof createFetchHandler>["core"];
};

/** Create a panel handler suitable for `Elysia.mount(path, handler)`. */
export function flagsPanel(options: FlagsPanelOptions): ElysiaFlagsHandler {
  const handler = createFetchHandler(options);
  const fn = ((request: Request) => handler.fetch(request)) as ElysiaFlagsHandler;
  fn.core = handler.core;
  return fn;
}

export type { FlagsPanelOptions };
