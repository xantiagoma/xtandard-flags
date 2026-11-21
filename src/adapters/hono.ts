/**
 * Hono adapter. Returns a `Hono` instance whose catch-all delegates to the
 * web-standard panel handler, so it composes via `app.route(path, panel)`.
 *
 * ```ts
 * import { flagsPanel } from "@xtandard/flags/hono";
 * app.route("/flags", flagsPanel({ basePath: "/flags", sourceStorage }));
 * ```
 *
 * @module
 */

import { Hono } from "hono";
import { mountPanel } from "@xtandard/kit/adapters/hono";
import {
  createFetchHandler,
  type CreateFetchHandlerResult,
  type FlagsPanelOptions,
} from "../server/create-fetch-handler.ts";

/** Create a Hono sub-app serving the panel. The admin `core` is attached. */
export function flagsPanel(options: FlagsPanelOptions): Hono & {
  core: CreateFetchHandlerResult["core"];
  openapi: CreateFetchHandlerResult["openapi"];
  close: CreateFetchHandlerResult["close"];
} {
  const handler = createFetchHandler(options);
  return Object.assign(mountPanel(new Hono(), handler.fetch), {
    core: handler.core,
    openapi: handler.openapi,
    close: handler.close,
  });
}

export type { FlagsPanelOptions };
