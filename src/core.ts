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

import { diff } from "ohash/utils";
import {
  environmentMetaKey,
  environmentsKey,
  projectMetaKey,
  projectsKey,
  publishedDraftKey,
  segmentsKey,
} from "./keys.ts";
import { compileDraft, nextVersion, SnapshotStore } from "./snapshot.ts";
import type {
  Actor,
  AuditEntry,
  Draft,
  EnvironmentMeta,
  EvaluationContext,
  Flag,
  FlagType,
  FlagValue,
  ProjectMeta,
  Segment,
  Snapshot,
} from "./schema.ts";
import type { EvaluationReason, FlagErrorCode } from "./schema.ts";
import type { ComparatorRegistry } from "./comparators.ts";
import { withComparators } from "./comparators.ts";
import type {
  AfterEvent,
  BeforeEvent,
  FlagsHooks,
  FlagsHooksInput,
  HookErrorReporter,
} from "./hooks/contract.ts";
import { defaultHookErrorReporter, normalizeHooks, runAfter, runBefore } from "./hooks/contract.ts";
import { evaluateFlag } from "./evaluator.ts";
import type { MatcherRegistry } from "./matchers.ts";
import { withMatchers } from "./matchers.ts";
import { inlineSegmentsInFlag, resolveSegments, validateSegmentReferences } from "./segments.ts";
import { tryCatchSync } from "./try-catch.ts";
import type { FlagsStorage } from "./storage/contract.ts";
import {
  assertValidDraft,
  DraftValidationError,
  validateFlag,
  validateSegment,
} from "./validation.ts";

/** One flag's outcome from {@link FlagsCore.evaluate}. */
export interface FlagEvaluationResult {
  key: string;
  value: FlagValue | undefined;
  variant: string | undefined;
  reason: EvaluationReason;
  errorCode?: FlagErrorCode;
  /** The flag's declared type (`boolean`/`string`/`number`/`json`), when known. */
  flagType?: FlagType;
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
  /**
   * Custom comparators for value-object types in evaluation contexts (e.g.
   * Dinero, Decimal), layered over the process-wide registry from
   * {@link ./comparators.registerComparator} for {@link FlagsCore.evaluate}
   * (test targeting). See {@link ./comparators.ComparatorRegistry}.
   */
  comparators?: ComparatorRegistry;
  /**
   * Named query matchers backing the `matches`/`notMatches` operators, layered
   * over the process-wide registry from {@link ./matchers.registerMatcher} for
   * {@link FlagsCore.evaluate}. See {@link ./matchers.MatcherRegistry}.
   */
  matchers?: MatcherRegistry;
  /**
   * Control-plane hooks fired around admin mutations. Pass one hook or an array.
   * `before` hooks run sequentially and may **throw to deny**; `after` hooks run
   * post-commit for side effects and never fail the operation. See
   * {@link ./hooks/contract.FlagsHooks}.
   */
  hooks?: FlagsHooksInput;
  /**
   * Reporter invoked when an `after` hook throws. Defaults to a `console.warn`.
   * The error is always swallowed — a failing side effect never rolls back an
   * already-committed mutation.
   */
  onHookError?: HookErrorReporter;
}

/** A snapshot version with its publish metadata, for history views. */
export interface SnapshotSummary {
  version: string;
  publishedAt?: string;
  by?: string;
  message?: string;
}

/** One field-level change between the published draft and the current draft. */
export interface DraftDiffEntry {
  type: "added" | "removed" | "changed";
  /** Dot path into `{ flags, segments }`, e.g. `flags.new-checkout.enabled`. */
  path: string;
  /** Human-readable one-liner (e.g. "Changed `flags.x.enabled` from `false` to `true`"). */
  summary: string;
}

/** The unpublished changes in a draft (see {@link FlagsCore.diffDraft}). */
export interface DraftDiff {
  /** False when the draft equals the last-published state (nothing to publish). */
  changed: boolean;
  entries: DraftDiffEntry[];
  /** Pretty-printed JSON of the last-published `{flags,segments}` (timestamps stripped). */
  before: string;
  /** Pretty-printed JSON of the current draft `{flags,segments}` (timestamps stripped). */
  after: string;
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
  readonly options: Required<
    Omit<FlagsCoreOptions, "runtimeStorage" | "comparators" | "matchers" | "hooks" | "onHookError">
  > & {
    runtimeStorage: FlagsStorage;
    comparators?: ComparatorRegistry;
    matchers?: MatcherRegistry;
    /** Normalized hooks (always an array). */
    hooks: FlagsHooks[];
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

  // Reusable segments
  listSegments(projectKey?: string, environmentKey?: string): Promise<Segment[]>;
  getSegment(
    segmentKey: string,
    projectKey?: string,
    environmentKey?: string,
  ): Promise<Segment | null>;
  upsertSegment(segment: Segment, projectKey?: string, environmentKey?: string): Promise<Segment>;
  deleteSegment(segmentKey: string, projectKey?: string, environmentKey?: string): Promise<void>;
  replaceDraft(draft: Draft): Promise<Draft>;

  /**
   * Field-level diff of the current draft (flags + segments) against the draft as
   * it was at the last publish — i.e. the unpublished changes. `changed` is false
   * when there is nothing to publish.
   */
  diffDraft(projectKey?: string, environmentKey?: string): Promise<DraftDiff>;
  /** Discard all unpublished changes: reset the draft to the last-published state. */
  discardDraft(projectKey?: string, environmentKey?: string): Promise<Draft>;
  /**
   * Replace the draft from an imported document (`{ flags, segments? }`, e.g. a
   * downloaded snapshot). Validates flags + segments (and references) before
   * writing; throws {@link DraftValidationError} on invalid input. Does not
   * publish — the caller reviews the resulting draft diff and publishes.
   */
  importDraft(
    input: { flags: Record<string, Flag>; segments?: Record<string, Segment> },
    projectKey?: string,
    environmentKey?: string,
  ): Promise<Draft>;

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
  const comparators = options.comparators;
  const matchers = options.matchers;
  const hooks = normalizeHooks(options.hooks);
  const onHookError = options.onHookError ?? defaultHookErrorReporter;

  const source = new SnapshotStore(sourceStorage);
  const runtime = new SnapshotStore(runtimeStorage);

  const guard = (op: string) => {
    if (readonly) throw new ReadonlyError(op);
  };

  // Hook dispatch: `before` may throw to deny (runs before commit); `after` is
  // best-effort (runs after commit, never fails the op). No-ops when unset.
  const before = hooks.length ? (event: BeforeEvent) => runBefore(hooks, event) : null;
  const after = hooks.length ? (event: AfterEvent) => runAfter(hooks, event, onHookError) : null;

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

  async function loadSegments(
    projectKey: string,
    environmentKey: string,
  ): Promise<Record<string, Segment>> {
    return (
      (await sourceStorage.getItem<Record<string, Segment>>(
        segmentsKey(projectKey, environmentKey),
      )) ?? {}
    );
  }

  // Stamp timestamps + persist a flag into the draft. No hooks, no validation —
  // callers (upsert/archive/restore) run those + fire the appropriate events.
  async function writeFlag(flag: Flag, projectKey: string, environmentKey: string): Promise<Flag> {
    const draft = await loadDraft(projectKey, environmentKey);
    const existing = draft.flags[flag.key];
    const now = new Date().toISOString();
    const stamped: Flag = {
      ...flag,
      createdAt: flag.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    };
    draft.flags[flag.key] = stamped;
    await source.putDraft(draft);
    return stamped;
  }

  return {
    options: {
      sourceStorage,
      runtimeStorage,
      defaultProjectKey,
      defaultEnvironmentKey,
      readonly,
      comparators,
      matchers,
      hooks,
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
      if (before) await before({ type: "flag.upsert", projectKey: p, environmentKey: e, flag });
      const stamped = await writeFlag(flag, p, e);
      if (after) {
        await after({
          type: "flag.upserted",
          projectKey: p,
          environmentKey: e,
          flag: stamped,
          at: stamped.updatedAt!,
        });
      }
      return stamped;
    },

    async archiveFlag(flagKey, projectKey, environmentKey) {
      guard("archive flags");
      const p = pk(projectKey);
      const e = ek(environmentKey);
      const draft = await loadDraft(p, e);
      const flag = draft.flags[flagKey];
      if (!flag) throw new NotFoundError(`flag "${flagKey}" not found`);
      const archived: Flag = { ...flag, archivedAt: new Date().toISOString() };
      if (before) {
        await before({
          type: "flag.archive",
          projectKey: p,
          environmentKey: e,
          flagKey,
          flag: archived,
        });
      }
      const stamped = await writeFlag(archived, p, e);
      if (after) {
        await after({
          type: "flag.archived",
          projectKey: p,
          environmentKey: e,
          flag: stamped,
          at: stamped.updatedAt!,
        });
      }
      return stamped;
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
      if (before) {
        await before({
          type: "flag.restore",
          projectKey: p,
          environmentKey: e,
          flagKey,
          flag: restored,
        });
      }
      const stamped = await writeFlag(restored, p, e);
      if (after) {
        await after({
          type: "flag.restored",
          projectKey: p,
          environmentKey: e,
          flag: stamped,
          at: stamped.updatedAt!,
        });
      }
      return stamped;
    },

    async listSegments(projectKey, environmentKey) {
      const segments = await loadSegments(pk(projectKey), ek(environmentKey));
      return Object.values(segments);
    },

    async getSegment(segmentKey, projectKey, environmentKey) {
      const segments = await loadSegments(pk(projectKey), ek(environmentKey));
      return segments[segmentKey] ?? null;
    },

    async upsertSegment(segment, projectKey, environmentKey) {
      guard("modify segments");
      const result = validateSegment(segment);
      if (!result.valid) {
        throw new SegmentValidationError(
          segment.key,
          result.errors.map((e) => `${e.path}: ${e.message}`),
        );
      }
      const p = pk(projectKey);
      const e = ek(environmentKey);
      await ensureEnvironment(p, e);
      if (before)
        await before({ type: "segment.upsert", projectKey: p, environmentKey: e, segment });
      const segments = await loadSegments(p, e);
      segments[segment.key] = segment;
      await sourceStorage.setItem(segmentsKey(p, e), segments);
      if (after) {
        await after({
          type: "segment.upserted",
          projectKey: p,
          environmentKey: e,
          segment,
          at: new Date().toISOString(),
        });
      }
      return segment;
    },

    async deleteSegment(segmentKey, projectKey, environmentKey) {
      guard("delete segments");
      const p = pk(projectKey);
      const e = ek(environmentKey);
      const segments = await loadSegments(p, e);
      if (!(segmentKey in segments)) {
        throw new NotFoundError(`segment "${segmentKey}" not found`);
      }
      if (before) {
        await before({ type: "segment.delete", projectKey: p, environmentKey: e, segmentKey });
      }
      delete segments[segmentKey];
      await sourceStorage.setItem(segmentsKey(p, e), segments);
      if (after) {
        await after({
          type: "segment.deleted",
          projectKey: p,
          environmentKey: e,
          segmentKey,
          at: new Date().toISOString(),
        });
      }
    },

    async deleteFlag(flagKey, projectKey, environmentKey) {
      guard("delete flags");
      const p = pk(projectKey);
      const e = ek(environmentKey);
      const draft = await loadDraft(p, e);
      if (!(flagKey in draft.flags)) throw new NotFoundError(`flag "${flagKey}" not found`);
      if (before) await before({ type: "flag.delete", projectKey: p, environmentKey: e, flagKey });
      delete draft.flags[flagKey];
      await source.putDraft(draft);
      if (after) {
        await after({
          type: "flag.deleted",
          projectKey: p,
          environmentKey: e,
          flagKey,
          at: new Date().toISOString(),
        });
      }
    },

    async replaceDraft(draft) {
      guard("replace draft");
      assertValidDraft(draft);
      await ensureEnvironment(draft.projectKey, draft.environmentKey);
      await source.putDraft(draft);
      return loadDraft(draft.projectKey, draft.environmentKey);
    },

    async diffDraft(projectKey, environmentKey) {
      const p = pk(projectKey);
      const e = ek(environmentKey);
      const [draft, segments] = await Promise.all([loadDraft(p, e), loadSegments(p, e)]);
      const baseline = (await sourceStorage.getItem<{
        flags: Record<string, Flag>;
        segments: Record<string, Segment>;
      }>(publishedDraftKey(p, e))) ?? { flags: {}, segments: {} };

      // Strip server-stamped timestamps — they change on every save and are noise,
      // not meaningful config edits. Applied to both the diff and the text blobs.
      const stripStamps = (m: Record<string, Flag>): Record<string, Flag> => {
        const out: Record<string, Flag> = {};
        for (const [k, f] of Object.entries(m)) {
          const { createdAt: _c, updatedAt: _u, ...rest } = f;
          out[k] = rest as Flag;
        }
        return out;
      };
      const before = {
        flags: stripStamps(baseline.flags ?? {}),
        segments: baseline.segments ?? {},
      };
      const after = { flags: stripStamps(draft.flags), segments };

      // Field-level diff (via ohash). Build our own summary from the values —
      // ohash's toString() renders `false` as `{}`.
      const fmt = (v: unknown): string => {
        if (v === undefined) return "∅";
        const s = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
        return s.length > 60 ? `${s.slice(0, 57)}…` : s;
      };
      const entries: DraftDiffEntry[] = diff(before, after)
        .slice(0, 500)
        .map((d) => {
          const oldV = d.oldValue?.value;
          const newV = d.newValue?.value;
          const summary =
            d.type === "added"
              ? `Added ${d.key}${newV !== undefined ? ` = ${fmt(newV)}` : ""}`
              : d.type === "removed"
                ? `Removed ${d.key}`
                : `Changed ${d.key}: ${fmt(oldV)} → ${fmt(newV)}`;
          return { type: d.type, path: d.key, summary };
        });
      return {
        changed: entries.length > 0,
        entries,
        before: JSON.stringify(before, null, 2),
        after: JSON.stringify(after, null, 2),
      };
    },

    async discardDraft(projectKey, environmentKey) {
      guard("discard draft");
      const p = pk(projectKey);
      const e = ek(environmentKey);
      const baseline = await sourceStorage.getItem<{
        flags: Record<string, Flag>;
        segments: Record<string, Segment>;
      }>(publishedDraftKey(p, e));
      const flags = baseline?.flags ?? {};
      const segments = baseline?.segments ?? {};
      await source.putDraft({ projectKey: p, environmentKey: e, flags });
      await sourceStorage.setItem(segmentsKey(p, e), segments);
      return loadDraft(p, e);
    },

    async importDraft(input, projectKey, environmentKey) {
      guard("import draft");
      const p = pk(projectKey);
      const e = ek(environmentKey);
      await ensureEnvironment(p, e);

      const flags = input.flags ?? {};
      const segments = input.segments ?? {};
      // Validate flags (structure + per-flag semantics) and segments before writing.
      const draft: Draft = { projectKey: p, environmentKey: e, flags };
      assertValidDraft(draft);
      for (const [key, seg] of Object.entries(segments)) {
        const r = validateSegment({ ...seg, key: seg.key ?? key });
        if (!r.valid) throw new DraftValidationError(r.errors);
      }
      const refErrors = validateSegmentReferences(flags, segments);
      if (refErrors.length > 0) throw new DraftValidationError(refErrors);

      await source.putDraft(draft);
      await sourceStorage.setItem(segmentsKey(p, e), segments);
      return loadDraft(p, e);
    },

    async publish(input = {}) {
      guard("publish");
      const p = pk(input.projectKey);
      const e = ek(input.environmentKey);
      const draft = await loadDraft(p, e);
      assertValidDraft(draft);

      // Resolve reusable segments: fail on dangling/cyclic references, then inline.
      const segments = await loadSegments(p, e);
      const refErrors = validateSegmentReferences(draft.flags, segments);
      if (refErrors.length > 0) throw new DraftValidationError(refErrors);

      // Gate: a `before` hook may veto the publish (e.g. test-gating, freeze
      // windows). Runs on the validated draft, before anything is written.
      if (before) {
        await before({
          type: "publish",
          projectKey: p,
          environmentKey: e,
          draft,
          actor: input.by ?? null,
          message: input.message,
        });
      }

      const existing = await source.listVersions(p, e);
      const version = nextVersion(existing);
      const snapshot = compileDraft(draft, { version, createdBy: input.by ?? null, segments });

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
      // Record the draft as-published — the baseline for diff + discard.
      await sourceStorage.setItem(publishedDraftKey(p, e), { flags: draft.flags, segments });
      if (after) {
        await after({
          type: "published",
          projectKey: p,
          environmentKey: e,
          snapshot,
          actor: input.by ?? null,
          message: input.message,
          at: snapshot.createdAt,
        });
      }
      return snapshot;
    },

    async rollback(input) {
      guard("rollback");
      const p = pk(input.projectKey);
      const e = ek(input.environmentKey);
      const target = await source.getSnapshot(p, e, input.version);
      if (!target) throw new NotFoundError(`snapshot "${input.version}" not found`);
      const from = await source.getActiveVersion(p, e);
      if (before) {
        await before({
          type: "rollback",
          projectKey: p,
          environmentKey: e,
          toVersion: input.version,
          fromVersion: from ?? undefined,
          actor: input.by ?? null,
          message: input.message,
        });
      }
      // Ensure runtime has the target snapshot (it should from publish), then re-point.
      await runtime.putSnapshot(target);
      await Promise.all([
        source.setActiveVersion(p, e, input.version),
        runtime.setActiveVersion(p, e, input.version),
      ]);
      const at = new Date().toISOString();
      await source.appendAudit(p, e, {
        version: input.version,
        action: "rollback",
        at,
        by: input.by ?? null,
        fromVersion: from ?? undefined,
        message: input.message,
      });
      if (after) {
        await after({
          type: "rolledback",
          projectKey: p,
          environmentKey: e,
          version: input.version,
          fromVersion: from ?? undefined,
          actor: input.by ?? null,
          message: input.message,
          at,
        });
      }
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
      // The active snapshot is already inSegment-inlined (and embeds resolved
      // segments for notInSegment); the draft is not, so resolve segments on the
      // fly for accurate pre-publish test targeting.
      let segments: Record<string, Segment> | null = null;
      let evalSegments: Record<string, Segment> = {};
      if (input.source === "active") {
        const snap = await source.getActiveSnapshot(p, e);
        flags = snap?.flags ?? {};
        evalSegments = snap?.segments ?? {};
      } else {
        flags = (await loadDraft(p, e)).flags;
        segments = await loadSegments(p, e);
        const [resolved] = tryCatchSync(() => resolveSegments(segments!));
        evalSegments = resolved ?? {};
      }
      // Build the resolved (segment-inlined) map once. Prerequisites resolve other
      // flags, so the evaluator needs the whole map, not just the target flag.
      const resolvedFlags: Record<string, Flag> = {};
      const inlineFailed = new Set<string>();
      for (const [key, flag] of Object.entries(flags)) {
        if (!segments) {
          resolvedFlags[key] = flag;
          continue;
        }
        const [inlined, err] = tryCatchSync(() => inlineSegmentsInFlag(flag, segments!));
        // Dangling/cyclic segment ref in the draft → report as an error result.
        if (err) inlineFailed.add(key);
        else resolvedFlags[key] = inlined;
      }

      const keys = input.flagKey
        ? input.flagKey in flags
          ? [input.flagKey]
          : []
        : Object.keys(flags);
      return keys.map((key) => {
        if (inlineFailed.has(key)) {
          return { key, value: undefined, variant: undefined, reason: "ERROR" as const };
        }
        const r = withComparators(comparators, () =>
          withMatchers(matchers, () =>
            evaluateFlag(resolvedFlags[key]!, input.context, resolvedFlags, evalSegments),
          ),
        );
        return {
          key,
          value: r.value,
          variant: r.variant,
          reason: r.reason,
          errorCode: r.errorCode,
          flagType: resolvedFlags[key]?.type,
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

/** Thrown by {@link FlagsCore.upsertSegment} when a segment fails validation. */
export class SegmentValidationError extends Error {
  readonly segmentKey: string;
  readonly errors: string[];
  constructor(segmentKey: string, errors: string[]) {
    super(`Segment "${segmentKey}" is invalid:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    this.name = "SegmentValidationError";
    this.segmentKey = segmentKey;
    this.errors = errors;
  }
}
