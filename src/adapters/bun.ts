/**
 * Bun adapter. The handler is already web-standard, so this is a passthrough you
 * can hand straight to `Bun.serve({ fetch })`.
 *
 * ```ts
 * import { flagsPanel } from "@xtandard/flags/bun";
 * const panel = flagsPanel({ sourceStorage });
 * Bun.serve({ port: 3000, fetch: panel.fetch });
 * ```
 *
 * @module
 */

import { createFetchHandler, type CreateFetchHandlerResult, type FlagsPanelOptions } from "../server/create-fetch-handler.ts";

/** Create a Bun-ready panel handler. */
export function flagsPanel(options: FlagsPanelOptions): CreateFetchHandlerResult {
  return createFetchHandler(options);
}

export type { FlagsPanelOptions, CreateFetchHandlerResult };
