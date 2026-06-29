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
import { createFetchHandler, type FlagsPanelOptions } from "../server/create-fetch-handler.ts";

/** Create a Hono sub-app serving the panel. The admin `core` is attached. */
export function flagsPanel(options: FlagsPanelOptions): Hono & { core: ReturnType<typeof createFetchHandler>["core"] } {
  const handler = createFetchHandler(options);
  const app = new Hono();
  app.all("*", (c) => handler.fetch(c.req.raw));
  return Object.assign(app, { core: handler.core });
}

export type { FlagsPanelOptions };
