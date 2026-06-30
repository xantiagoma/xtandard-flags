/**
 * Storage key layout for `@xtandard/flags`.
 *
 * Keys are namespaced by project/environment so a single storage backend can
 * host many projects. Pure string helpers — no dependencies.
 *
 * ```txt
 * flags/{project}/{env}/active_version   -> "v43"
 * flags/{project}/{env}/snapshots/{ver}  -> Snapshot JSON
 * flags/{project}/{env}/draft            -> Draft JSON
 * flags/{project}/{env}/segments         -> Record<key, Segment> JSON
 * flags/{project}/{env}/audit/{ver}      -> AuditEntry JSON
 * flags/{project}/{env}/metadata         -> EnvironmentMeta JSON
 * flags/{project}/metadata               -> ProjectMeta JSON
 * flags/projects                         -> string[] of project keys
 * ```
 *
 * @module
 */

/** Root namespace segment for all keys. */
export const ROOT = "flags";

const env = (projectKey: string, environmentKey: string) =>
  `${ROOT}/${projectKey}/${environmentKey}`;

/** Index key listing all known project keys. */
export const projectsKey = () => `${ROOT}/projects`;

/** Metadata for a single project. */
export const projectMetaKey = (projectKey: string) => `${ROOT}/${projectKey}/metadata`;

/** Index key listing all environment keys within a project. */
export const environmentsKey = (projectKey: string) => `${ROOT}/${projectKey}/environments`;

/** Metadata for a single environment. */
export const environmentMetaKey = (projectKey: string, environmentKey: string) =>
  `${env(projectKey, environmentKey)}/metadata`;

/** Holds the currently active snapshot version string (e.g. `"v43"`). */
export const activeVersionKey = (projectKey: string, environmentKey: string) =>
  `${env(projectKey, environmentKey)}/active_version`;

/** Prefix under which all immutable snapshots live. */
export const snapshotsPrefix = (projectKey: string, environmentKey: string) =>
  `${env(projectKey, environmentKey)}/snapshots`;

/** A single immutable snapshot. */
export const snapshotKey = (projectKey: string, environmentKey: string, version: string) =>
  `${snapshotsPrefix(projectKey, environmentKey)}/${version}`;

/** The mutable working draft. */
export const draftKey = (projectKey: string, environmentKey: string) =>
  `${env(projectKey, environmentKey)}/draft`;

/** Reusable segments for an environment, stored as a `Record<key, Segment>`. */
export const segmentsKey = (projectKey: string, environmentKey: string) =>
  `${env(projectKey, environmentKey)}/segments`;

/** Prefix under which audit entries live. */
export const auditPrefix = (projectKey: string, environmentKey: string) =>
  `${env(projectKey, environmentKey)}/audit`;

/**
 * Append-only audit log for an environment, stored as an ordered `AuditEntry[]`.
 * One immutable entry per event (publish/rollback) — never keyed by version, so
 * a rollback to an earlier version cannot overwrite that version's publish record.
 */
export const auditLogKey = (projectKey: string, environmentKey: string) =>
  `${env(projectKey, environmentKey)}/audit-log`;

/** Extract the trailing segment (snapshot version / audit version) from a key. */
export const lastSegment = (key: string): string => {
  const parts = key.split("/");
  return parts[parts.length - 1] ?? "";
};
