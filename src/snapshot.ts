/**
 * Snapshot compilation, versioning, and storage operations.
 *
 * A snapshot is an immutable, versioned freeze of a draft for one
 * project/environment. Publishing writes a new `snapshots/{version}` and flips
 * `active_version`; rollback flips `active_version` back to an earlier snapshot.
 * The runtime provider reads whole snapshots — never individual flags.
 *
 * @module
 */

import {
  activeVersionKey,
  auditKey,
  auditPrefix,
  draftKey,
  lastSegment,
  snapshotKey,
  snapshotsPrefix,
} from "./keys.ts";
import { SNAPSHOT_SCHEMA_VERSION } from "./schema.ts";
import type { Actor, AuditEntry, Draft, Flag, Snapshot } from "./schema.ts";
import type { FlagsStorage } from "./storage/contract.ts";

/** Options for {@link compileDraft}. */
export interface CompileOptions {
  version: string;
  createdAt?: string;
  createdBy?: Actor | null;
}

/**
 * Deep-clone flags so the compiled snapshot is decoupled from the live draft.
 * Archived flags ({@link Flag.archivedAt} set) are excluded so they leave SDK
 * payloads and stop being evaluated — they remain in the draft for restore.
 */
function freezeFlags(flags: Record<string, Flag>): Record<string, Flag> {
  const live: Record<string, Flag> = {};
  for (const [key, flag] of Object.entries(flags)) {
    if (flag.archivedAt) continue;
    live[key] = flag;
  }
  return structuredClone(live);
}

/**
 * Compile a draft into an immutable snapshot. Does not persist anything.
 *
 * @example
 * ```ts
 * import { compileDraft } from "@xtandard/flags";
 *
 * const snapshot = compileDraft(
 *   { projectKey: "default", environmentKey: "production", flags: {} },
 *   { version: "v1", createdBy: { id: "ci", name: "CI" } },
 * );
 * // snapshot.version === "v1"
 * ```
 */
export function compileDraft(draft: Draft, options: CompileOptions): Snapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    version: options.version,
    projectKey: draft.projectKey,
    environmentKey: draft.environmentKey,
    createdAt: options.createdAt ?? new Date().toISOString(),
    createdBy: options.createdBy ?? null,
    flags: freezeFlags(draft.flags),
  };
}

/**
 * Compute the next `v{n}` version given the set of existing version strings.
 *
 * @example
 * ```ts
 * import { nextVersion } from "@xtandard/flags";
 *
 * nextVersion([]);           // → "v1"
 * nextVersion(["v1", "v2"]); // → "v3"
 * ```
 */
export function nextVersion(existing: string[]): string {
  let max = 0;
  for (const v of existing) {
    const m = /^v(\d+)$/.exec(v);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `v${max + 1}`;
}

/**
 * Storage-backed snapshot operations. Constructed over any {@link FlagsStorage}.
 * The runtime provider uses only the read methods.
 *
 * @example
 * ```ts
 * import { SnapshotStore } from "@xtandard/flags";
 * import { createMemoryStorage } from "@xtandard/flags/storage/memory";
 *
 * const storage = createMemoryStorage();
 * const store = new SnapshotStore(storage);
 *
 * const draft = { projectKey: "default", environmentKey: "staging", flags: {} };
 * const snapshot = await store.publish(draft, { createdBy: { id: "ci" } });
 * // snapshot.version === "v1"
 *
 * const active = await store.getActiveSnapshot("default", "staging");
 * // active?.version === "v1"
 * ```
 */
export class SnapshotStore {
  constructor(private readonly storage: FlagsStorage) {}

  /** Current active version string, or `null` if nothing is published. */
  getActiveVersion(projectKey: string, environmentKey: string): Promise<string | null> {
    return this.storage.getItem<string>(activeVersionKey(projectKey, environmentKey));
  }

  /** Read a specific snapshot by version. */
  getSnapshot(
    projectKey: string,
    environmentKey: string,
    version: string,
  ): Promise<Snapshot | null> {
    return this.storage.getItem<Snapshot>(snapshotKey(projectKey, environmentKey, version));
  }

  /** Read the currently active snapshot (active_version → snapshot), or `null`. */
  async getActiveSnapshot(projectKey: string, environmentKey: string): Promise<Snapshot | null> {
    const version = await this.getActiveVersion(projectKey, environmentKey);
    if (!version) return null;
    return this.getSnapshot(projectKey, environmentKey, version);
  }

  /** List all snapshot version strings, newest first. */
  async listVersions(projectKey: string, environmentKey: string): Promise<string[]> {
    const keys = await this.storage.getKeys(snapshotsPrefix(projectKey, environmentKey) + "/");
    return keys
      .map(lastSegment)
      .filter((v) => /^v\d+$/.test(v))
      .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  }

  /** Persist a snapshot (does not change active_version). */
  async putSnapshot(snapshot: Snapshot): Promise<void> {
    await this.storage.setItem(
      snapshotKey(snapshot.projectKey, snapshot.environmentKey, snapshot.version),
      snapshot,
    );
  }

  /** Set the active version pointer. */
  async setActiveVersion(
    projectKey: string,
    environmentKey: string,
    version: string,
  ): Promise<void> {
    await this.storage.setItem(activeVersionKey(projectKey, environmentKey), version);
  }

  /**
   * Compile the draft, persist it as the next snapshot, flip active_version, and
   * append an audit entry. Returns the new snapshot.
   */
  async publish(
    draft: Draft,
    options: { createdBy?: Actor | null; message?: string } = {},
  ): Promise<Snapshot> {
    const existing = await this.listVersions(draft.projectKey, draft.environmentKey);
    const version = nextVersion(existing);
    const snapshot = compileDraft(draft, { version, createdBy: options.createdBy });
    await this.putSnapshot(snapshot);
    await this.setActiveVersion(draft.projectKey, draft.environmentKey, version);
    await this.appendAudit(draft.projectKey, draft.environmentKey, {
      version,
      action: "publish",
      at: snapshot.createdAt,
      by: options.createdBy ?? null,
      message: options.message,
    });
    return snapshot;
  }

  /**
   * Flip active_version back to an existing snapshot and record an audit entry.
   * Throws if the target version does not exist.
   */
  async rollback(
    projectKey: string,
    environmentKey: string,
    targetVersion: string,
    options: { by?: Actor | null; message?: string } = {},
  ): Promise<Snapshot> {
    const target = await this.getSnapshot(projectKey, environmentKey, targetVersion);
    if (!target) throw new Error(`snapshot "${targetVersion}" not found`);
    const from = await this.getActiveVersion(projectKey, environmentKey);
    await this.setActiveVersion(projectKey, environmentKey, targetVersion);
    await this.appendAudit(projectKey, environmentKey, {
      version: targetVersion,
      action: "rollback",
      at: new Date().toISOString(),
      by: options.by ?? null,
      fromVersion: from ?? undefined,
      message: options.message,
    });
    return target;
  }

  /** Append an audit entry. */
  async appendAudit(projectKey: string, environmentKey: string, entry: AuditEntry): Promise<void> {
    await this.storage.setItem(auditKey(projectKey, environmentKey, entry.version), entry);
  }

  /** List audit entries, newest first. */
  async listAudit(projectKey: string, environmentKey: string): Promise<AuditEntry[]> {
    const keys = await this.storage.getKeys(auditPrefix(projectKey, environmentKey) + "/");
    const entries = await Promise.all(keys.map((k) => this.storage.getItem<AuditEntry>(k)));
    return entries
      .filter((e): e is AuditEntry => e !== null)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }

  /** Read the working draft, or `null`. */
  getDraft(projectKey: string, environmentKey: string): Promise<Draft | null> {
    return this.storage.getItem<Draft>(draftKey(projectKey, environmentKey));
  }

  /** Write the working draft. */
  async putDraft(draft: Draft): Promise<void> {
    await this.storage.setItem(draftKey(draft.projectKey, draft.environmentKey), {
      ...draft,
      updatedAt: new Date().toISOString(),
    });
  }
}
