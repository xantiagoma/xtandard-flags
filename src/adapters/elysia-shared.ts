/**
 * Elysia-version-agnostic pieces shared by the 1.x (`./elysia.ts`) and 2.x
 * (`./elysia2.ts`) adapters. Must not import `elysia`: each adapter's types are
 * built against a different major.
 *
 * @module
 */

import { createPass as kitCreatePass, type PassContext } from "@xtandard/kit/adapters/elysia";
import { createFetchHandler, type FlagsPanelOptions } from "../server/create-fetch-handler.ts";

/** A web-standard fetch handler with the admin `core` + `openapi()` attached. */
export type ElysiaFlagsHandler = ((request: Request) => Promise<Response>) & {
  core: ReturnType<typeof createFetchHandler>["core"];
  openapi: ReturnType<typeof createFetchHandler>["openapi"];
  close: ReturnType<typeof createFetchHandler>["close"];
};

/** Create a panel handler suitable for `Elysia.mount(path, handler)`. */
export function flagsPanel(options: FlagsPanelOptions): ElysiaFlagsHandler {
  const handler = createFetchHandler(options);
  const fn = ((request: Request) => handler.fetch(request)) as ElysiaFlagsHandler;
  fn.core = handler.core;
  fn.openapi = handler.openapi;
  fn.close = handler.close;
  return fn;
}

/** Options for `flagsElysia`. */
export interface FlagsElysiaOptions extends FlagsPanelOptions {
  /** Mount prefix; also used as the panel basePath. Default `"/flags"`. */
  prefix?: string;
}

/**
 * Build the handler every declared route delegates to. Elysia parses the body
 * for declared routes, draining the stream; rebuild the Request from the parsed
 * body before delegating (mirrors the Express adapter).
 */
export function createPass(options: FlagsElysiaOptions): {
  prefix: string;
  pass: (ctx: PassContext) => Promise<Response>;
} {
  const prefix = options.prefix ?? "/flags";
  const handler = createFetchHandler({ ...options, basePath: options.basePath ?? prefix });

  const { pass } = kitCreatePass({ prefix, fetch: handler.fetch, name: "xtandard-flags" });
  return { prefix, pass };
}

export type { FlagsPanelOptions };
