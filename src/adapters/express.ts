/**
 * Express adapter. Express predates the web Fetch API, so this bridges Node's
 * `req`/`res` to the web-standard handler: it builds a `Request` from the
 * incoming message, runs {@link createFetchHandler}, and writes the `Response`
 * back. No `express` import at runtime — only its types.
 *
 * Mount it BEFORE any body-parser middleware (it reads the raw request body):
 *
 * ```ts
 * import express from "express";
 * import { flagsPanel } from "@xtandard/flags/express";
 * const app = express();
 * app.use("/flags", flagsPanel({ basePath: "/flags", sourceStorage }));
 * ```
 *
 * @module
 */

import type { NextFunction, Request as ExRequest, Response as ExResponse } from "express";
import { toExpressMiddleware } from "@xtandard/kit/adapters/express";
import { createFetchHandler, type FlagsPanelOptions } from "../server/create-fetch-handler.ts";

/** An Express request handler with the admin `core` attached. */
export type ExpressFlagsHandler = ((
  req: ExRequest,
  res: ExResponse,
  next: NextFunction,
) => void) & {
  core: ReturnType<typeof createFetchHandler>["core"];
  openapi: ReturnType<typeof createFetchHandler>["openapi"];
  close: ReturnType<typeof createFetchHandler>["close"];
};

/** Create an Express handler serving the panel. Use with `app.use(path, handler)`. */
export function flagsPanel(options: FlagsPanelOptions): ExpressFlagsHandler {
  const handler = createFetchHandler(options);

  // The kit's Node bridge: every Set-Cookie kept, multi-value headers appended,
  // pre-parsed bodies re-serialised, responses streamed with backpressure (so
  // the OFREP SSE stream works under Express too).
  const middleware = toExpressMiddleware(handler.fetch);

  return Object.assign(middleware, {
    core: handler.core,
    openapi: handler.openapi,
    close: handler.close,
  });
}

export type { FlagsPanelOptions };
