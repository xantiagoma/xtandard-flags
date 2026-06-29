/**
 * Admin core — the operations layer the API and CLI sit on top of.
 *
 * Owns the distinction between **source storage** (canonical drafts, full
 * snapshot history, audit) and **runtime storage** (the published snapshots that
 * application runtimes read). Publishing compiles the draft and writes the new
 * snapshot to *both* stores, then flips `active_version` in both; rollback
 * re-points `active_version`. The runtime provider therefore only ever needs
 * `runtimeStorage`.
 *
 * @module
 */

import { environmentMetaKey, environmentsKey, projectMetaKey, projectsKey } from "./keys.ts";
import { compileDraft, nextVersion, SnapshotStore } from "./snapshot.ts";
import type {
  Actor,
  AuditEntry,
  Draft,
  EnvironmentMeta,
  EvaluationContext,
  Flag,
  FlagValue,
  ProjectMeta,
  Snapshot,
} from "./schema.ts";
import type { EvaluationReason, FlagErrorCode } from "./schema.ts";
import { evaluateFlag } from "./evaluator.ts";
import type { FlagsStorage } from "./storage/contract.ts";
import { assertValidDraft, validateFlag } from "./validation.ts";

/** One flag's outcome from {@link FlagsCore.evaluate}. */
export interface FlagEvaluationResult {
  key: string;
  value: FlagValue | undefined;
  variant: string | undefined;
  reason: EvaluationReason;
  errorCode?: FlagErrorCode;
}

/** Input to {@link FlagsCore.evaluate}. */
export interface EvaluateInput {
  context: EvaluationContext;
  /** Limit to a single flag; omit to evaluate all flags. */
  flagKey?: string;
  /** Evaluate the working `draft` (default — test before publishing) or the `active` snapshot. */
  source?: "draft" | "active";
  projectKey?: string;
  environmentKey?: string;
}

/** Options for {@link createFlagsCore}. */
export interface FlagsCoreOptions {
  /** Canonical store: drafts, snapshot history, audit. */
  sourceStorage: FlagsStorage;
  /** Published-snapshot store read by runtimes. Defaults to `sourceStorage`. */
  runtimeStorage?: FlagsStorage;
  /** Default project key when callers omit one. Default `"default"`. */
  defaultProjectKey?: string;
  /** Default environment key when callers omit one. Default `"production"`. */
  defaultEnvironmentKey?: string;
  /** When true, all mutating operations throw {@link ReadonlyError}. */
  readonly?: boolean;
}

/** A snapshot version with its publish metadata, for history views. */
export interface SnapshotSummary {
  version: string;
  publishedAt?: string;
  by?: string;
  message?: string;
}

/** Thrown by mutating operations when the core is in readonly mode. */
export class ReadonlyError extends Error {
  constructor(operation: string) {
    super(`Cannot ${operation}: @xtandard/flags is in readonly mode.`);
    this.name = "ReadonlyError";
  }
}

/** Thrown when a referenced project/environment/flag/snapshot does not exist. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The admin core surface. */
export interface FlagsCore {
  readonly options: Required<Omit<FlagsCoreOptions, "runtimeStorage">> & {
    runtimeStorage: FlagsStorage;
  };

  // Projects
  listProjects(): Promise<ProjectMeta[]>;
  createProject(input: { key: string; name?: string }): Promise<ProjectMeta>;
  getProject(projectKey: string): Promise<ProjectMeta | null>;

  // Environments
  listEnvironments(projectKey: string): Promise<EnvironmentMeta[]>;
  createEnvironment(
    projectKey: string,
    input: { key: string; name?: string },
  ): Promise<EnvironmentMeta>;

  // Draft + flags
  getDraft(projectKey?: string, environmentKey?: string): Promise<Draft>;
  listFlags(projectKey?: string, environmentKey?: string): Promise<Flag[]>;
  getFlag(flagKey: string, projectKey?: string, environmentKey?: string): Promise<Flag | null>;
  upsertFlag(flag: Flag, projectKey?: string, environmentKey?: string): Promise<Flag>;
  deleteFlag(flagKey: string, projectKey?: string, environmentKey?: string): Promise<void>;
  /**
   * Archive a flag: stamp {@link Flag.archivedAt} so it is excluded from the next
   * compiled snapshot (leaves SDK payloads) while remaining in the draft for restore.
   * Throws {@link NotFoundError} if the flag does not exist.
   */
  archiveFlag(flagKey: string, projectKey?: string, environmentKey?: string): Promise<Flag>;
  /** Restore an archived flag by clearing {@link Flag.archivedAt}. */
  restoreFlag(flagKey: string, projectKey?: string, environmentKey?: string): Promise<Flag>;
  replaceDraft(draft: Draft): Promise<Draft>;

  // Publish / rollback / history
  publish(input?: {
    projectKey?: string;
    environmentKey?: string;
    by?: Actor | null;
    message?: string;
  }): Promise<Snapshot>;
  rollback(input: {
    version: string;
    projectKey?: string;
    environmentKey?: string;
    by?: Actor | null;
    message?: string;
  }): Promise<Snapshot>;
  listSnapshots(projectKey?: string, environmentKey?: string): Promise<string[]>;
  listSnapshotSummaries(projectKey?: string, environmentKey?: string): Promise<SnapshotSummary[]>;
  getSnapshot(
    version: string,
    projectKey?: string,
    environmentKey?: string,
  ): Promise<Snapshot | null>;
  getActiveSnapshot(projectKey?: string, environmentKey?: string): Promise<Snapshot | null>;
  getActiveVersion(projectKey?: string, environmentKey?: string): Promise<string | null>;
  listAudit(projectKey?: string, environmentKey?: string): Promise<AuditEntry[]>;

  /**
   * Evaluate flags against a context (test targeting) using the draft or active snapshot.
   *
   * @example
   * ```ts
   * const results = await core.evaluate({
   *   context: { targetingKey: "user-123", plan: "pro" },
   *   source: "draft",
   * });
   * for (const r of results) {
   *   console.log(r.key, r.value, r.reason);
   * }
   * ```
   */
  evaluate(input: EvaluateInput): Promise<FlagEvaluationResult[]>;
}

/**
 * Construct the admin core over the configured storage.
 *
 * @example
 * ```ts
 * import { createFlagsCore } from "@xtandard/flags";
 * import { createMemoryStorage } from "@xtandard/flags/storage/memory";
 *
 * const storage = createMemoryStorage();
 * const core = createFlagsCore({ sourceStorage: storage });
 *
 * await core.upsertFlag({
 *   key: "dark-mode",
 *   type: "boolean",
 *   enabled: true,
 *   defaultVariant: "off",
 *   variants: { on: { value: true }, off: { value: false } },
 *   fallthrough: { variant: "off" },
 * });
 *
 * const snapshot = await core.publish({ message: "Enable dark-mode flag" });
 * console.log(snapshot.version); // "v1"
 * ```
 */
export function createFlagsCore(options: FlagsCoreOptions): FlagsCore {
  const sourceStorage = options.sourceStorage;
  const runtimeStorage = options.runtimeStorage ?? options.sourceStorage;
  const defaultProjectKey = options.defaultProjectKey ?? "default";
  const defaultEnvironmentKey = options.defaultEnvironmentKey ?? "production";
  const readonly = options.readonly ?? false;

  const source = new SnapshotStore(sourceStorage);
  const runtime = new SnapshotStore(runtimeStorage);

  const guard = (op: string) => {
    if (readonly) throw new ReadonlyError(op);
  };

  const pk = (k?: string) => k ?? defaultProjectKey;
  const ek = (k?: string) => k ?? defaultEnvironmentKey;

  async function indexAdd(key: string, value: string): Promise<void> {
    const list = (await sourceStorage.getItem<string[]>(key)) ?? [];
    if (!list.includes(value)) {
      list.push(value);
      await sourceStorage.setItem(key, list);
    }
  }

  async function ensureProject(projectKey: string): Promise<void> {
    const meta = await sourceStorage.getItem<ProjectMeta>(projectMetaKey(projectKey));
    if (!meta) {
      await sourceStorage.setItem<ProjectMeta>(projectMetaKey(projectKey), {
        key: projectKey,
        createdAt: new Date().toISOString(),
      });
      await indexAdd(projectsKey(), projectKey);
    }
  }

  async function ensureEnvironment(projectKey: string, environmentKey: string): Promise<void> {
    await ensureProject(projectKey);
    const meta = await sourceStorage.getItem<EnvironmentMeta>(
      environmentMetaKey(projectKey, environmentKey),
    );
    if (!meta) {
      await sourceStorage.setItem<EnvironmentMeta>(environmentMetaKey(projectKey, environmentKey), {
        key: environmentKey,
        createdAt: new Date().toISOString(),
      });
      await indexAdd(environmentsKey(projectKey), environmentKey);
    }
  }

  async function loadDraft(projectKey: string, environmentKey: string): Promise<Draft> {
    const existing = await source.getDraft(projectKey, environmentKey);
    if (existing) return existing;
    return { projectKey, environmentKey, flags: {} };
  }

  return {
    options: {
      sourceStorage,
      runtimeStorage,
      defaultProjectKey,
      defaultEnvironmentKey,
      readonly,
    },

    async listProjects() {
      await ensureProject(defaultProjectKey);
      const keys = (await sourceStorage.getItem<string[]>(projectsKey())) ?? [];
      const metas = await Promise.all(
        keys.map((k) => sourceStorage.getItem<ProjectMeta>(projectMetaKey(k))),
      );
      return metas.filter((m): m is ProjectMeta => m !== null);
    },

    async createProject({ key, name }) {
      guard("create project");
      const meta: ProjectMeta = { key, name, createdAt: new Date().toISOString() };
      await sourceStorage.setItem(projectMetaKey(key), meta);
      await indexAdd(projectsKey(), key);
      return meta;
    },

    getProject(projectKey) {
      return sourceStorage.getItem<ProjectMeta>(projectMetaKey(projectKey));
    },

    async listEnvironments(projectKey) {
      await ensureEnvironment(projectKey, defaultEnvironmentKey);
      const keys = (await sourceStorage.getItem<string[]>(environmentsKey(projectKey))) ?? [];
      const metas = await Promise.all(
        keys.map((k) => sourceStorage.getItem<EnvironmentMeta>(environmentMetaKey(projectKey, k))),
      );
      return metas.filter((m): m is EnvironmentMeta => m !== null);
    },

    async createEnvironment(projectKey, { key, name }) {
      guard("create environment");
      await ensureProject(projectKey);
      const meta: EnvironmentMeta = { key, name, createdAt: new Date().toISOString() };
      await sourceStorage.setItem(environmentMetaKey(projectKey, key), meta);
      await indexAdd(environmentsKey(projectKey), key);
      return meta;
    },

    async getDraft(projectKey, environmentKey) {
      const p = pk(projectKey);
      const e = ek(environmentKey);
      await ensureEnvironment(p, e);
      return loadDraft(p, e);
    },

    async listFlags(projectKey, environmentKey) {
      const draft = await loadDraft(pk(projectKey), ek(environmentKey));
      return Object.values(draft.flags);
    },

    async getFlag(flagKey, projectKey, environmentKey) {
      const draft = await loadDraft(pk(projectKey), ek(environmentKey));
      return draft.flags[flagKey] ?? null;
    },

    async upsertFlag(flag, projectKey, environmentKey) {
      guard("modify flags");
      const result = validateFlag(flag);
      if (!result.valid) {
        throw new FlagValidationError(
          flag.key,
          result.errors.map((e) => `${e.path}: ${e.message}`),
        );
      }
      const p = pk(projectKey);
      const e = ek(environmentKey);
      await ensureEnvironment(p, e);
      const draft = await loadDraft(p, e);
      draft.flags[flag.key] = flag;
      await source.putDraft(draft);
      return flag;
    },

    async archiveFlag(flagKey, projectKey, environmentKey) {
      guard("archive flags");
      const p = pk(projectKey);
      const e = ek(environmentKey);
      const draft = await loadDraft(p, e);
      const flag = draft.flags[flagKey];
      if (!flag) throw new NotFoundError(`flag "${flagKey}" not found`);
      return this.upsertFlag({ ...flag, archivedAt: new Date().toISOString() }, p, e);
    },

    async restoreFlag(flagKey, projectKey, environmentKey) {
      guard("restore flags");
      const p = pk(projectKey);
      const e = ek(environmentKey);
      const draft = await loadDraft(p, e);
      const flag = draft.flags[flagKey];
      if (!flag) throw new NotFoundError(`flag "${flagKey}" not found`);
      const restored: Flag = { ...flag };
      delete restored.archivedAt;
      return this.upsertFlag(restored, p, e);
    },

    async deleteFlag(flagKey, projectKey, environmentKey) {
      guard("delete flags");
      const p = pk(projectKey);
      const e = ek(environmentKey);
      const draft = await loadDraft(p, e);
      if (!(flagKey in draft.flags)) throw new NotFoundError(`flag "${flagKey}" not found`);
      delete draft.flags[flagKey];
      await source.putDraft(draft);
    },

    async replaceDraft(draft) {
      guard("replace draft");
      assertValidDraft(draft);
      await ensureEnvironment(draft.projectKey, draft.environmentKey);
      await source.putDraft(draft);
      return loadDraft(draft.projectKey, draft.environmentKey);
    },

    async publish(input = {}) {
      guard("publish");
      const p = pk(input.projectKey);
      const e = ek(input.environmentKey);
      const draft = await loadDraft(p, e);
      assertValidDraft(draft);

      const existing = await source.listVersions(p, e);
      const version = nextVersion(existing);
      const snapshot = compileDraft(draft, { version, createdBy: input.by ?? null });

      // Write to both stores, then flip active_version in both.
      await Promise.all([source.putSnapshot(snapshot), runtime.putSnapshot(snapshot)]);
      await Promise.all([
        source.setActiveVersion(p, e, version),
        runtime.setActiveVersion(p, e, version),
      ]);
      await source.appendAudit(p, e, {
        version,
        action: "publish",
        at: snapshot.createdAt,
        by: input.by ?? null,
        message: input.message,
      });
      return snapshot;
    },

    async rollback(input) {
      guard("rollback");
      const p = pk(input.projectKey);
      const e = ek(input.environmentKey);
      const target = await source.getSnapshot(p, e, input.version);
      if (!target) throw new NotFoundError(`snapshot "${input.version}" not found`);
      const from = await source.getActiveVersion(p, e);
      // Ensure runtime has the target snapshot (it should from publish), then re-point.
      await runtime.putSnapshot(target);
      await Promise.all([
        source.setActiveVersion(p, e, input.version),
        runtime.setActiveVersion(p, e, input.version),
      ]);
      await source.appendAudit(p, e, {
        version: input.version,
        action: "rollback",
        at: new Date().toISOString(),
        by: input.by ?? null,
        fromVersion: from ?? undefined,
        message: input.message,
      });
      return target;
    },

    listSnapshots(projectKey, environmentKey) {
      return source.listVersions(pk(projectKey), ek(environmentKey));
    },

    async listSnapshotSummaries(projectKey, environmentKey) {
      const p = pk(projectKey);
      const e = ek(environmentKey);
      const [versions, audit] = await Promise.all([
        source.listVersions(p, e),
        source.listAudit(p, e),
      ]);
      // Most recent publish message per version (audit is newest-first).
      const messageByVersion = new Map<string, string>();
      for (const entry of audit) {
        if (entry.action === "publish" && entry.message && !messageByVersion.has(entry.version)) {
          messageByVersion.set(entry.version, entry.message);
        }
      }
      const snapshots = await Promise.all(versions.map((v) => source.getSnapshot(p, e, v)));
      return versions.map((version, i) => {
        const snap = snapshots[i];
        const by = snap?.createdBy?.email ?? snap?.createdBy?.name ?? snap?.createdBy?.id;
        return {
          version,
          publishedAt: snap?.createdAt,
          by,
          message: messageByVersion.get(version),
        } satisfies SnapshotSummary;
      });
    },

    getSnapshot(version, projectKey, environmentKey) {
      return source.getSnapshot(pk(projectKey), ek(environmentKey), version);
    },

    getActiveSnapshot(projectKey, environmentKey) {
      return source.getActiveSnapshot(pk(projectKey), ek(environmentKey));
    },

    getActiveVersion(projectKey, environmentKey) {
      return source.getActiveVersion(pk(projectKey), ek(environmentKey));
    },

    listAudit(projectKey, environmentKey) {
      return source.listAudit(pk(projectKey), ek(environmentKey));
    },

    async evaluate(input) {
      const p = pk(input.projectKey);
      const e = ek(input.environmentKey);
      let flags: Record<string, Flag>;
      if (input.source === "active") {
        const snap = await source.getActiveSnapshot(p, e);
        flags = snap?.flags ?? {};
      } else {
        flags = (await loadDraft(p, e)).flags;
      }
      const entries = input.flagKey
        ? flags[input.flagKey]
          ? [[input.flagKey, flags[input.flagKey]] as const]
          : []
        : Object.entries(flags);
      return entries.map(([key, flag]) => {
        const r = evaluateFlag(flag!, input.context);
        return {
          key,
          value: r.value,
          variant: r.variant,
          reason: r.reason,
          errorCode: r.errorCode,
        };
      });
    },
  };
}

/** Thrown by {@link FlagsCore.upsertFlag} when a flag fails validation. */
export class FlagValidationError extends Error {
  readonly flagKey: string;
  readonly errors: string[];
  constructor(flagKey: string, errors: string[]) {
    super(`Flag "${flagKey}" is invalid:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    this.name = "FlagValidationError";
    this.flagKey = flagKey;
    this.errors = errors;
  }
}
