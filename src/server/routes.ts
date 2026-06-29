/**
 * JSON admin API. A tiny method+pattern router over {@link FlagsCore}, wired to
 * authentication and authorization. Returns `null` for non-API paths so the
 * caller can fall through to static-asset / SPA handling.
 *
 * @module
 */

import type { AuthProvider, Principal } from "../auth/contract.ts";
import type {
  AuthorizationProvider,
  FlagsAction,
  FlagsResource,
} from "../authorization/contract.ts";
import { FlagValidationError, NotFoundError, ReadonlyError, type FlagsCore } from "../core.ts";
import { DraftValidationError } from "../validation.ts";
import { buildOpenApiDocument } from "./openapi.ts";
import type { Draft, Flag } from "../schema.ts";

/** Everything the API router needs. */
export interface ApiContext {
  core: FlagsCore;
  auth: AuthProvider;
  authorization: AuthorizationProvider;
  title: string;
  readonly: boolean;
  basePath: string;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const error = (status: number, message: string, extra?: Record<string, unknown>): Response =>
  json({ error: message, ...extra }, status);

interface Matched {
  params: Record<string, string>;
}

/** Match `pattern` (with `:name` segments) against `path`. */
function match(pattern: string, path: string): Matched | null {
  const pp = pattern.split("/").filter(Boolean);
  const ap = path.split("/").filter(Boolean);
  if (pp.length !== ap.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i]!;
    const val = ap[i]!;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(val);
    else if (seg !== val) return null;
  }
  return { params };
}

/**
 * Handle an API request. `path` is already base-path-stripped. Returns a
 * `Response` for API/config routes, or `null` if the path is not an API route.
 */
export async function handleApiRequest(
  request: Request,
  path: string,
  ctx: ApiContext,
): Promise<Response | null> {
  const isApi =
    path === "/config" ||
    path === "/api/config" ||
    path === "/openapi.json" ||
    path.startsWith("/api/");
  if (!isApi) return null;

  const method = request.method.toUpperCase();

  // Public OpenAPI document (no auth) — for docs tooling and host-app merging.
  if (path === "/api/openapi.json" || path === "/openapi.json") {
    return json(buildOpenApiDocument({ basePath: ctx.basePath, title: ctx.title }));
  }

  // --- Authentication ---
  let principal: Principal | null = null;
  try {
    principal = await ctx.auth.authenticate(request);
  } catch {
    principal = null;
  }

  // Public bootstrap config (whether the client should show a login, etc.).
  if (path === "/config" || path === "/api/config") {
    return json({
      title: ctx.title,
      basePath: ctx.basePath,
      readonly: ctx.readonly,
      authenticated: principal !== null,
      principal: principal
        ? { id: principal.id, email: principal.email, name: principal.name, roles: principal.roles }
        : null,
      defaultProjectKey: ctx.core.options.defaultProjectKey,
      defaultEnvironmentKey: ctx.core.options.defaultEnvironmentKey,
    });
  }

  if (principal === null) {
    const challenge = ctx.auth.challenge?.(request);
    return challenge ?? error(401, "Unauthorized");
  }

  const authorize = async (
    action: FlagsAction,
    resource: FlagsResource,
  ): Promise<Response | null> => {
    const ok = await ctx.authorization.authorize({ principal, action, resource, request });
    return ok ? null : error(403, "Forbidden", { action });
  };

  const body = async <T>(): Promise<T> => (await request.json()) as T;

  try {
    // --- Projects ---
    if (path === "/api/projects") {
      if (method === "GET") {
        const denied = await authorize("project:read", { type: "project", projectKey: "*" });
        if (denied) return denied;
        return json(await ctx.core.listProjects());
      }
      if (method === "POST") {
        const input = await body<{ key: string; name?: string }>();
        const denied = await authorize("project:create", {
          type: "project",
          projectKey: input.key,
        });
        if (denied) return denied;
        return json(await ctx.core.createProject(input), 201);
      }
    }

    let m = match("/api/projects/:projectKey/environments", path);
    if (m) {
      const { projectKey } = m.params;
      if (method === "GET") {
        const denied = await authorize("environment:read", {
          type: "project",
          projectKey: projectKey!,
        });
        if (denied) return denied;
        return json(await ctx.core.listEnvironments(projectKey!));
      }
      if (method === "POST") {
        const input = await body<{ key: string; name?: string }>();
        const denied = await authorize("environment:create", {
          type: "environment",
          projectKey: projectKey!,
          environmentKey: input.key,
        });
        if (denied) return denied;
        return json(await ctx.core.createEnvironment(projectKey!, input), 201);
      }
    }

    const base = "/api/projects/:projectKey/environments/:environmentKey";

    // --- Flags collection ---
    m = match(`${base}/flags`, path);
    if (m) {
      const { projectKey, environmentKey } = m.params;
      if (method === "GET") {
        const denied = await authorize("flag:read", {
          type: "environment",
          projectKey: projectKey!,
          environmentKey: environmentKey!,
        });
        if (denied) return denied;
        return json(await ctx.core.listFlags(projectKey, environmentKey));
      }
      if (method === "POST") {
        const flag = await body<Flag>();
        const denied = await authorize("flag:create", {
          type: "flag",
          projectKey: projectKey!,
          environmentKey: environmentKey!,
          flagKey: flag.key,
        });
        if (denied) return denied;
        return json(await ctx.core.upsertFlag(flag, projectKey, environmentKey), 201);
      }
    }

    // --- Single flag ---
    m = match(`${base}/flags/:flagKey`, path);
    if (m) {
      const { projectKey, environmentKey, flagKey } = m.params;
      const resource: FlagsResource = {
        type: "flag",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
        flagKey: flagKey!,
      };
      if (method === "GET") {
        const denied = await authorize("flag:read", resource);
        if (denied) return denied;
        const flag = await ctx.core.getFlag(flagKey!, projectKey, environmentKey);
        return flag ? json(flag) : error(404, `flag "${flagKey}" not found`);
      }
      if (method === "PUT") {
        const flag = await body<Flag>();
        const denied = await authorize("flag:update", resource);
        if (denied) return denied;
        return json(
          await ctx.core.upsertFlag({ ...flag, key: flagKey! }, projectKey, environmentKey),
        );
      }
      if (method === "DELETE") {
        const denied = await authorize("flag:delete", resource);
        if (denied) return denied;
        await ctx.core.deleteFlag(flagKey!, projectKey, environmentKey);
        return json({ ok: true });
      }
    }

    // --- Archive / restore a flag ---
    m = match(`${base}/flags/:flagKey/archive`, path);
    if (m && method === "POST") {
      const { projectKey, environmentKey, flagKey } = m.params;
      const denied = await authorize("flag:update", {
        type: "flag",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
        flagKey: flagKey!,
      });
      if (denied) return denied;
      return json(await ctx.core.archiveFlag(flagKey!, projectKey, environmentKey));
    }

    m = match(`${base}/flags/:flagKey/restore`, path);
    if (m && method === "POST") {
      const { projectKey, environmentKey, flagKey } = m.params;
      const denied = await authorize("flag:update", {
        type: "flag",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
        flagKey: flagKey!,
      });
      if (denied) return denied;
      return json(await ctx.core.restoreFlag(flagKey!, projectKey, environmentKey));
    }

    // --- Draft ---
    m = match(`${base}/draft`, path);
    if (m) {
      const { projectKey, environmentKey } = m.params;
      const resource: FlagsResource = {
        type: "environment",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
      };
      if (method === "GET") {
        const denied = await authorize("flag:read", resource);
        if (denied) return denied;
        return json(await ctx.core.getDraft(projectKey, environmentKey));
      }
      if (method === "PUT") {
        const draft = await body<Draft>();
        const denied = await authorize("flag:update", resource);
        if (denied) return denied;
        return json(
          await ctx.core.replaceDraft({
            ...draft,
            projectKey: projectKey!,
            environmentKey: environmentKey!,
          }),
        );
      }
    }

    // --- Publish ---
    m = match(`${base}/publish`, path);
    if (m && method === "POST") {
      const { projectKey, environmentKey } = m.params;
      const denied = await authorize("snapshot:publish", {
        type: "snapshot",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
      });
      if (denied) return denied;
      const input = await body<{ message?: string }>().catch(() => ({ message: undefined }));
      const snapshot = await ctx.core.publish({
        projectKey,
        environmentKey,
        by: principal,
        message: input.message,
      });
      return json(snapshot, 201);
    }

    // --- Rollback ---
    m = match(`${base}/rollback`, path);
    if (m && method === "POST") {
      const { projectKey, environmentKey } = m.params;
      const input = await body<{ version: string; message?: string }>();
      const denied = await authorize("snapshot:rollback", {
        type: "snapshot",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
        version: input.version,
      });
      if (denied) return denied;
      const snapshot = await ctx.core.rollback({
        version: input.version,
        projectKey,
        environmentKey,
        by: principal,
        message: input.message,
      });
      return json(snapshot);
    }

    // --- Snapshots ---
    m = match(`${base}/snapshots`, path);
    if (m && method === "GET") {
      const { projectKey, environmentKey } = m.params;
      const denied = await authorize("snapshot:read", {
        type: "snapshot",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
      });
      if (denied) return denied;
      const versions = await ctx.core.listSnapshotSummaries(projectKey, environmentKey);
      const active = await ctx.core.getActiveVersion(projectKey, environmentKey);
      return json({ versions, active });
    }

    m = match(`${base}/snapshots/:version`, path);
    if (m && method === "GET") {
      const { projectKey, environmentKey, version } = m.params;
      const denied = await authorize("snapshot:read", {
        type: "snapshot",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
        version: version!,
      });
      if (denied) return denied;
      const snapshot = await ctx.core.getSnapshot(version!, projectKey, environmentKey);
      return snapshot ? json(snapshot) : error(404, `snapshot "${version}" not found`);
    }

    // --- Active snapshot (convenience) ---
    m = match(`${base}/active`, path);
    if (m && method === "GET") {
      const { projectKey, environmentKey } = m.params;
      const denied = await authorize("snapshot:read", {
        type: "snapshot",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
      });
      if (denied) return denied;
      return json(await ctx.core.getActiveSnapshot(projectKey, environmentKey));
    }

    // --- Audit ---
    m = match(`${base}/audit`, path);
    if (m && method === "GET") {
      const { projectKey, environmentKey } = m.params;
      const denied = await authorize("audit:read", {
        type: "audit",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
      });
      if (denied) return denied;
      return json(await ctx.core.listAudit(projectKey, environmentKey));
    }

    // --- Evaluate (test targeting against a context) ---
    m = match(`${base}/evaluate`, path);
    if (m && method === "POST") {
      const { projectKey, environmentKey } = m.params;
      const denied = await authorize("flag:read", {
        type: "environment",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
      });
      if (denied) return denied;
      const input = await body<{
        context?: Record<string, unknown>;
        flagKey?: string;
        source?: "draft" | "active";
      }>();
      const results = await ctx.core.evaluate({
        context: input.context ?? {},
        flagKey: input.flagKey,
        source: input.source,
        projectKey,
        environmentKey,
      });
      return json({ results });
    }

    // --- Bootstrap (prefetch all flags as a keyed map for client SDKs) ---
    m = match(`${base}/bootstrap`, path);
    if (m && method === "POST") {
      const { projectKey, environmentKey } = m.params;
      const denied = await authorize("flag:read", {
        type: "environment",
        projectKey: projectKey!,
        environmentKey: environmentKey!,
      });
      if (denied) return denied;
      const input = await body<{
        context?: Record<string, unknown>;
        source?: "draft" | "active";
      }>().catch(() => ({}) as { context?: Record<string, unknown>; source?: "draft" | "active" });
      const results = await ctx.core.evaluate({
        context: input.context ?? {},
        // Client SDKs prefetch the published snapshot by default.
        source: input.source ?? "active",
        projectKey,
        environmentKey,
      });
      const flags: Record<string, { value: unknown; variant?: string; reason: string }> = {};
      for (const r of results) {
        flags[r.key] = { value: r.value, variant: r.variant, reason: r.reason };
      }
      return json({ flags });
    }

    return error(404, "Not found");
  } catch (err) {
    return mapError(err);
  }
}

/** Map domain errors to HTTP responses. */
function mapError(err: unknown): Response {
  if (err instanceof ReadonlyError) return error(403, err.message, { code: "READONLY" });
  if (err instanceof NotFoundError) return error(404, err.message);
  if (err instanceof FlagValidationError) {
    return error(422, err.message, { code: "VALIDATION", errors: err.errors });
  }
  if (err instanceof DraftValidationError) {
    return error(422, err.message, { code: "VALIDATION", errors: err.errors });
  }
  if (err instanceof SyntaxError) return error(400, "Invalid JSON body");
  const message = err instanceof Error ? err.message : "Internal error";
  return error(500, message);
}
