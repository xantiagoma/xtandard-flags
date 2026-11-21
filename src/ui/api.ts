import type { Flag, FlagsConfig, Segment, SnapshotListResponse, AuditEntry } from "./types.ts";
import { createApiClient, type ApiClient } from "@xtandard/kit/ui";
import { FlagsApiError } from "./types.ts";

/**
 * The flags API client (`@xtandard/kit/ui`'s): a base URL (empty by default, so
 * the bundled SPA uses relative URLs resolved against the injected
 * `<base href>`), the `credentials` mode and an optional custom `fetch`.
 * Non-2xx responses throw {@link FlagsApiError}. Each product has its own
 * client, so two dashboards on one page never share a base URL.
 */
const client = createApiClient({ errorClass: FlagsApiError });

export type { ApiClientOptions, FetchLike } from "@xtandard/kit/ui";

/** Point the API client at a base URL (used by the `@xtandard/flags/react` export). */
export const setApiBase: ApiClient["setApiBase"] = client.setApiBase;

/** Attach a Bearer token to every request (the embed's token plumbing; flags has no portal). */
export const setApiToken: ApiClient["setApiToken"] = client.setApiToken;

const req = client.req;

function envBase(projectKey: string, environmentKey: string): string {
  return `api/projects/${encodeURIComponent(projectKey)}/environments/${encodeURIComponent(environmentKey)}`;
}

export function getConfig(): Promise<FlagsConfig> {
  return req<FlagsConfig>("config");
}

export function listFlags(projectKey: string, environmentKey: string): Promise<Flag[]> {
  return req<Flag[]>(`${envBase(projectKey, environmentKey)}/flags`);
}

export function createFlag(projectKey: string, environmentKey: string, flag: Flag): Promise<Flag> {
  return req<Flag>(`${envBase(projectKey, environmentKey)}/flags`, {
    method: "POST",
    body: JSON.stringify(flag),
  });
}

export function updateFlag(
  projectKey: string,
  environmentKey: string,
  key: string,
  flag: Flag,
): Promise<Flag> {
  return req<Flag>(`${envBase(projectKey, environmentKey)}/flags/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify(flag),
  });
}

export function deleteFlag(
  projectKey: string,
  environmentKey: string,
  key: string,
): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>(
    `${envBase(projectKey, environmentKey)}/flags/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
}

export function archiveFlag(
  projectKey: string,
  environmentKey: string,
  key: string,
): Promise<Flag> {
  return req<Flag>(
    `${envBase(projectKey, environmentKey)}/flags/${encodeURIComponent(key)}/archive`,
    { method: "POST" },
  );
}

export function restoreFlag(
  projectKey: string,
  environmentKey: string,
  key: string,
): Promise<Flag> {
  return req<Flag>(
    `${envBase(projectKey, environmentKey)}/flags/${encodeURIComponent(key)}/restore`,
    { method: "POST" },
  );
}

export function listSegments(projectKey: string, environmentKey: string): Promise<Segment[]> {
  return req<Segment[]>(`${envBase(projectKey, environmentKey)}/segments`);
}

export function createSegment(
  projectKey: string,
  environmentKey: string,
  segment: Segment,
): Promise<Segment> {
  return req<Segment>(`${envBase(projectKey, environmentKey)}/segments`, {
    method: "POST",
    body: JSON.stringify(segment),
  });
}

export function updateSegment(
  projectKey: string,
  environmentKey: string,
  key: string,
  segment: Segment,
): Promise<Segment> {
  return req<Segment>(
    `${envBase(projectKey, environmentKey)}/segments/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      body: JSON.stringify(segment),
    },
  );
}

export function deleteSegment(
  projectKey: string,
  environmentKey: string,
  key: string,
): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>(
    `${envBase(projectKey, environmentKey)}/segments/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
}

export function publish(
  projectKey: string,
  environmentKey: string,
  message?: string,
): Promise<unknown> {
  return req<unknown>(`${envBase(projectKey, environmentKey)}/publish`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function rollback(
  projectKey: string,
  environmentKey: string,
  version: string,
  message?: string,
): Promise<unknown> {
  return req<unknown>(`${envBase(projectKey, environmentKey)}/rollback`, {
    method: "POST",
    body: JSON.stringify({ version, message }),
  });
}

/** Delete a snapshot (server rejects the active + latest versions with 409). */
export function deleteSnapshot(
  projectKey: string,
  environmentKey: string,
  version: string,
): Promise<void> {
  return req<void>(`${envBase(projectKey, environmentKey)}/snapshots/${version}`, {
    method: "DELETE",
  });
}

export function listSnapshots(
  projectKey: string,
  environmentKey: string,
): Promise<SnapshotListResponse> {
  return req<SnapshotListResponse>(`${envBase(projectKey, environmentKey)}/snapshots`);
}

export interface SnapshotDetail {
  schemaVersion?: number;
  version: string;
  projectKey?: string;
  environmentKey?: string;
  createdAt?: string;
  createdBy?: unknown;
  flags: Record<string, Flag>;
  segments?: Record<string, Segment>;
  publishedAt?: string;
  message?: string;
  by?: string;
}

export function getSnapshot(
  projectKey: string,
  environmentKey: string,
  version: string,
): Promise<SnapshotDetail> {
  return req<SnapshotDetail>(
    `${envBase(projectKey, environmentKey)}/snapshots/${encodeURIComponent(version)}`,
  );
}

export function listAudit(projectKey: string, environmentKey: string): Promise<AuditEntry[]> {
  return req<AuditEntry[]>(`${envBase(projectKey, environmentKey)}/audit`);
}

export function getDraft(projectKey: string, environmentKey: string): Promise<unknown> {
  return req<unknown>(`${envBase(projectKey, environmentKey)}/draft`);
}

export interface DraftDiffEntry {
  type: "added" | "removed" | "changed";
  path: string;
  summary: string;
}
export interface DraftDiff {
  changed: boolean;
  entries: DraftDiffEntry[];
  before: string;
  after: string;
}

/** Field-level diff of the draft vs the last-published state (unpublished changes). */
export function draftDiff(projectKey: string, environmentKey: string): Promise<DraftDiff> {
  return req<DraftDiff>(`${envBase(projectKey, environmentKey)}/draft/diff`);
}

/** Discard all unpublished changes, resetting the draft to the last-published state. */
export function discardDraft(projectKey: string, environmentKey: string): Promise<unknown> {
  return req<unknown>(`${envBase(projectKey, environmentKey)}/draft/discard`, { method: "POST" });
}

/**
 * Import a JSON document (flags + optional segments) into the draft, replacing it.
 * Validated server-side; throws FlagsApiError on validation failure. Review the
 * resulting draft and publish to make it a new version.
 */
export function importDraft(
  projectKey: string,
  environmentKey: string,
  doc: { flags: Record<string, Flag>; segments?: Record<string, Segment> },
): Promise<unknown> {
  return req<unknown>(`${envBase(projectKey, environmentKey)}/draft/import`, {
    method: "POST",
    body: JSON.stringify(doc),
  });
}

/** Absolute URL of the JSON Schema for import documents (for embedding as `$schema`). */
export function schemaUrl(): string {
  const base = client.apiUrl("api/schema.json");
  try {
    return new URL(base, document.baseURI).href;
  } catch {
    return base;
  }
}

export interface EvaluationResult {
  key: string;
  value: unknown;
  variant?: string;
  reason: string;
  errorCode?: string;
}

/** Test how flags resolve for a given evaluation context (against the saved draft). */
export function evaluate(
  projectKey: string,
  environmentKey: string,
  context: Record<string, unknown>,
  opts: { flagKey?: string; source?: "draft" | "active" } = {},
): Promise<{ results: EvaluationResult[] }> {
  return req<{ results: EvaluationResult[] }>(`${envBase(projectKey, environmentKey)}/evaluate`, {
    method: "POST",
    body: JSON.stringify({ context, ...opts }),
  });
}

export function listProjects(): Promise<{ key: string; name?: string }[]> {
  return req<{ key: string; name?: string }[]>("api/projects");
}

export function listEnvironments(projectKey: string): Promise<{ key: string; name?: string }[]> {
  return req<{ key: string; name?: string }[]>(
    `api/projects/${encodeURIComponent(projectKey)}/environments`,
  );
}

export function createProject(key: string): Promise<{ key: string; name?: string }> {
  return req<{ key: string; name?: string }>("api/projects", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

export function createEnvironment(
  projectKey: string,
  key: string,
): Promise<{ key: string; name?: string }> {
  return req<{ key: string; name?: string }>(
    `api/projects/${encodeURIComponent(projectKey)}/environments`,
    { method: "POST", body: JSON.stringify({ key }) },
  );
}
