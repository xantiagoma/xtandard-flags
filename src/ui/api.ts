import type {
  Flag,
  FlagsConfig,
  Segment,
  SnapshotListResponse,
  AuditEntry,
  ApiError,
} from "./types.ts";
import { FlagsApiError } from "./types.ts";

// Base prepended to every request path. Empty by default so the bundled SPA uses
// relative URLs (resolved against the injected <base href>). The React component
// export sets this to the panel's mount URL via setApiBase().
let apiBase = "";

/** Point the API client at a base URL (used by the `@xtandard/flags/react` export). */
export function setApiBase(base: string): void {
  apiBase = base.replace(/\/$/, "");
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiBase ? `${apiBase}/${path}` : path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let body: ApiError;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = { status: res.status, error: res.statusText };
    }
    throw new FlagsApiError(res.status, body);
  }

  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

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

export function listSnapshots(
  projectKey: string,
  environmentKey: string,
): Promise<SnapshotListResponse> {
  return req<SnapshotListResponse>(`${envBase(projectKey, environmentKey)}/snapshots`);
}

export interface SnapshotDetail {
  version: string;
  flags: Flag[];
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
