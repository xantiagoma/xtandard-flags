/**
 * The web-standard fetch handler at the heart of every framework adapter and the
 * standalone app. Composes auth/authorization, the JSON admin API, static-asset
 * serving, and SPA fallback into a single `(request: Request) => Promise<Response>`.
 *
 * @module
 */

import {
  createPanelHandler,
  requireOneOf,
  resolveUiDir,
  type CorsOptions,
  type PanelTask,
} from "@xtandard/kit/server";
import type { AuthProvider } from "../auth/contract.ts";
import type { AuthorizationProvider } from "../authorization/contract.ts";
import { createFlagsCore, type FlagsCore, type RetentionOptions } from "../core.ts";
import type { FlagsHooksInput, HookErrorReporter } from "../hooks/contract.ts";
import type { EvaluationErrorReporter, EvaluationListener } from "../evaluation-sink.ts";
import type { FlagsStorage } from "../storage/contract.ts";
import { buildOpenApiDocument } from "./openapi.ts";
import { handleApiRequest, type ApiContext } from "./routes.ts";
import { createSseManager } from "./sse.ts";

/**
 * CORS for a cross-origin embed (`@xtandard/kit/server`): `origin` (a string,
 * list or predicate), `credentials`, `headers`, `methods` and `maxAge`.
 */
export type FlagsCorsOptions = CorsOptions;

/** Options for the panel handler (shared by every framework adapter). */
export interface FlagsPanelOptions {
  /**
   * Canonical storage: drafts, snapshot history, audit. Required unless a
   * prebuilt `core` is given.
   */
  sourceStorage?: FlagsStorage;
  /** Published-snapshot store read by runtimes. Defaults to `sourceStorage`. */
  runtimeStorage?: FlagsStorage;
  /** Mount prefix, e.g. `"/flags"`. Default `""` (root). */
  basePath?: string;
  /** Authentication provider. Default: anonymous (no auth). */
  auth?: AuthProvider;
  /** Authorization provider. Default: allow all. */
  authorization?: AuthorizationProvider;
  /** Block all mutating operations when true. */
  readonly?: boolean;
  /** UI title shown in the page and bootstrap config. */
  title?: string;
  /** Logo image URL shown in the navbar in place of the title wordmark. */
  logoUrl?: string;
  /** Default project key. Default `"default"`. */
  defaultProjectKey?: string;
  /** Default environment key. Default `"production"`. */
  defaultEnvironmentKey?: string;
  /** Override the directory the bundled UI is served from (defaults to `./ui` beside this module). */
  uiDir?: string;
  /** Reuse an existing core instead of constructing one. */
  core?: FlagsCore;
  /**
   * Control-plane hooks fired around admin mutations (see
   * {@link ../hooks/contract.FlagsHooks}). Ignored when `core` is supplied —
   * configure hooks on that core instead.
   */
  hooks?: FlagsHooksInput;
  /** Reporter for errors thrown by `after` hooks. Default: `console.warn`. */
  onHookError?: HookErrorReporter;
  /**
   * Snapshot/audit retention policy, applied after each publish. Ignored when a
   * prebuilt `core` is supplied — configure it on that core instead. See
   * {@link ../core.RetentionOptions}.
   */
  retention?: RetentionOptions;
  /**
   * Fire-and-forget observer invoked per **OFREP** evaluation served by this
   * panel (off the response path). For usage/exposure pipelines. See
   * {@link ../evaluation-sink.EvaluationListener}. (In-process evaluation is
   * observed via the provider's own `onEvaluation` option.)
   */
  onEvaluation?: EvaluationListener;
  /** Reporter for errors thrown by `onEvaluation`. Default: `console.warn`. */
  onEvaluationError?: EvaluationErrorReporter;
  /**
   * Enable CORS on the handler itself — answers `OPTIONS` preflights and attaches
   * `Access-Control-*` headers to every response, so a **cross-origin** embed
   * works regardless of the host framework. See {@link FlagsCorsOptions}.
   */
  cors?: FlagsCorsOptions;
  /**
   * Enable the opt-in OFREP SSE stream (`{basePath}/ofrep/v1/stream`) that pushes
   * `configuration_changed` events on publish/rollback. Requires a streaming
   * runtime (Bun, the standalone `serve`, Hono, Elysia). Default `false`.
   */
  streaming?: boolean;
}

/** Return shape of {@link createFetchHandler}. */
export interface CreateFetchHandlerResult {
  /** Web-standard request handler. */
  fetch(request: Request): Promise<Response>;
  /** The underlying admin core (handy for tests, CLI, and standalone wiring). */
  core: FlagsCore;
  /**
   * The admin API as an OpenAPI 3.1 document (also served at `{basePath}/api/openapi.json`).
   * Merge it into your host app's docs — e.g. Elysia `@elysiajs/openapi` `references`.
   */
  openapi(): Record<string, unknown>;
  /** Stop background work (the OFREP SSE poller and its open streams). Idempotent. */
  close(): Promise<void>;
}

// Anonymous defaults keep embedded usage zero-config; harden via auth/authorization.
const defaultAuth: AuthProvider = { authenticate: async () => ({ id: "anonymous" }) };
const defaultAuthorization: AuthorizationProvider = { authorize: async () => true };

/**
 * Build the panel fetch handler.
 *
 * @example
 * ```ts
 * import { createFetchHandler } from "@xtandard/flags";
 * import { createFileStorage } from "@xtandard/flags/storage/file";
 *
 * const storage = createFileStorage({ dir: "./data/flags" });
 * const { fetch, core } = createFetchHandler({
 *   sourceStorage: storage,
 *   basePath: "/flags",
 *   title: "Acme Flags",
 * });
 *
 * Bun.serve({ port: 3000, fetch });
 * ```
 */
export function createFetchHandler(options: FlagsPanelOptions): CreateFetchHandlerResult {
  const readonly = options.readonly ?? false;
  const title = options.title ?? "@xtandard/flags";

  // Either a prebuilt `core` (its own source of truth for storage) or a
  // `sourceStorage` to build one from is required.
  requireOneOf("createFetchHandler", options, ["sourceStorage", "core"]);

  const core =
    options.core ??
    createFlagsCore({
      sourceStorage: options.sourceStorage!,
      runtimeStorage: options.runtimeStorage,
      defaultProjectKey: options.defaultProjectKey,
      defaultEnvironmentKey: options.defaultEnvironmentKey,
      readonly,
      hooks: options.hooks,
      onHookError: options.onHookError,
      retention: options.retention,
    });

  const sse = options.streaming ? createSseManager({ core }) : undefined;
  const tasks: PanelTask[] = sse ? [{ stop: () => sse.close() }] : [];

  let apiCtx: ApiContext | undefined;
  const panel = createPanelHandler({
    basePath: options.basePath,
    title,
    readonly,
    globalName: "__FLAGS_CONFIG__",
    uiDir: options.uiDir ?? resolveUiDir(import.meta.url),
    ...(options.logoUrl !== undefined ? { logoUrl: options.logoUrl } : {}),
    ...(options.cors ? { cors: options.cors } : {}),
    bootstrap: () => ({
      defaultProjectKey: core.options.defaultProjectKey,
      defaultEnvironmentKey: core.options.defaultEnvironmentKey,
    }),
    api: (request, path) => handleApiRequest(request, path, apiCtx!),
    tasks,
  });
  const { basePath } = panel;

  apiCtx = {
    core,
    auth: options.auth ?? defaultAuth,
    authorization: options.authorization ?? defaultAuthorization,
    title,
    readonly,
    basePath,
    logoUrl: options.logoUrl,
    sse,
    onEvaluation: options.onEvaluation,
    onEvaluationError:
      options.onEvaluationError ??
      ((error, event) =>
        console.warn(`[@xtandard/flags] onEvaluation for "${event.flagKey}" threw:`, error)),
  };

  return {
    fetch: panel.fetch,
    core,
    openapi: () => buildOpenApiDocument({ basePath, title }),
    close: panel.close,
  };
}
