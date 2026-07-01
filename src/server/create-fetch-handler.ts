/**
 * The web-standard fetch handler at the heart of every framework adapter and the
 * standalone app. Composes auth/authorization, the JSON admin API, static-asset
 * serving, and SPA fallback into a single `(request: Request) => Promise<Response>`.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AuthProvider } from "../auth/contract.ts";
import type { AuthorizationProvider } from "../authorization/contract.ts";
import { createFlagsCore, type FlagsCore } from "../core.ts";
import type { FlagsHooksInput, HookErrorReporter } from "../hooks/contract.ts";
import type { EvaluationErrorReporter, EvaluationListener } from "../evaluation-sink.ts";
import type { FlagsStorage } from "../storage/contract.ts";
import { applyCorsHeaders, preflightResponse, type FlagsCorsOptions } from "./cors.ts";
import { normalizeBasePath, stripBasePath } from "./base-path.ts";
import { renderIndexHtml } from "./render-index-html.ts";
import { buildOpenApiDocument } from "./openapi.ts";
import { handleApiRequest, type ApiContext } from "./routes.ts";
import { createSseManager } from "./sse.ts";
import { looksLikeAsset, serveStaticAsset } from "./static-assets.ts";

/** Options for the panel handler (shared by every framework adapter). */
export interface FlagsPanelOptions {
  /** Canonical storage: drafts, snapshot history, audit. */
  sourceStorage: FlagsStorage;
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
   * works regardless of the host framework. See {@link ./cors.FlagsCorsOptions}.
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
}

// Anonymous defaults keep embedded usage zero-config; harden via auth/authorization.
const defaultAuth: AuthProvider = { authenticate: async () => ({ id: "anonymous" }) };
const defaultAuthorization: AuthorizationProvider = { authorize: async () => true };

/**
 * Locate the built admin SPA (`dist/ui`). When this module runs compiled (the
 * normal npm-consumer case) it lives in `dist/` and the bundle is the sibling
 * `./ui`. When it runs from TypeScript source (examples / dev against a
 * `file:`-linked checkout, where the runtime executes `src/server/*.ts`
 * directly), the bundle is instead at `<repo>/dist/ui` — i.e. `../../dist/ui`
 * relative to `src/server/`. Try the candidates and return the first that
 * exists, falling back to the compiled-layout path so the "build the UI" hint
 * still fires when nothing is built yet.
 */
function defaultUiDir(): string {
  try {
    const candidates = [
      new URL("./ui", import.meta.url), // compiled: dist/<chunk>.mjs → dist/ui
      new URL("../../dist/ui", import.meta.url), // source: src/server/*.ts → <repo>/dist/ui
    ].map((u) => fileURLToPath(u));
    return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
  } catch {
    return "./ui";
  }
}

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
  const basePath = normalizeBasePath(options.basePath);
  const readonly = options.readonly ?? false;
  const title = options.title ?? "@xtandard/flags";
  const uiDir = options.uiDir ?? defaultUiDir();

  const core =
    options.core ??
    createFlagsCore({
      sourceStorage: options.sourceStorage,
      runtimeStorage: options.runtimeStorage,
      defaultProjectKey: options.defaultProjectKey,
      defaultEnvironmentKey: options.defaultEnvironmentKey,
      readonly,
      hooks: options.hooks,
      onHookError: options.onHookError,
    });

  const apiCtx: ApiContext = {
    core,
    auth: options.auth ?? defaultAuth,
    authorization: options.authorization ?? defaultAuthorization,
    title,
    readonly,
    basePath,
    logoUrl: options.logoUrl,
    sse: options.streaming ? createSseManager({ core }) : undefined,
    onEvaluation: options.onEvaluation,
    onEvaluationError:
      options.onEvaluationError ??
      ((error, event) =>
        console.warn(`[@xtandard/flags] onEvaluation for "${event.flagKey}" threw:`, error)),
  };

  const cors = options.cors;

  async function fetch(request: Request): Promise<Response> {
    // CORS preflight: answer OPTIONS directly so it works for any path,
    // independent of the host framework wrapping this handler.
    if (cors && request.method === "OPTIONS") return preflightResponse(request, cors);
    const response = await respond(request);
    return cors ? applyCorsHeaders(request, response, cors) : response;
  }

  async function respond(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = stripBasePath(url.pathname, basePath);

    // 1. JSON API + bootstrap config.
    const api = await handleApiRequest(request, path, apiCtx);
    if (api) return api;

    // 2. Only GET/HEAD reach the static UI.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 3. Static asset.
    const asset = await serveStaticAsset(uiDir, path);
    if (asset) return asset;

    // 4. A path that looks like a file but was not found → 404 (don't mask with the SPA).
    if (path !== "/" && looksLikeAsset(path)) {
      return new Response("Not Found", { status: 404 });
    }

    // 5. SPA fallback.
    const html = await renderIndexHtml(uiDir, {
      title,
      basePath,
      readonly,
      defaultProjectKey: core.options.defaultProjectKey,
      defaultEnvironmentKey: core.options.defaultEnvironmentKey,
      logoUrl: options.logoUrl,
    });
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return { fetch, core, openapi: () => buildOpenApiDocument({ basePath, title }) };
}
