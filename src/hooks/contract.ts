/**
 * Hook contracts — control-plane extensibility around admin mutations.
 *
 * A hook is plain JavaScript wired in at {@link ../core.createFlagsCore} time
 * (never authored through the UI — that would be remote code execution). Two
 * phases, deliberately asymmetric:
 *
 * - **`before`** runs *before* a mutation commits. Throwing **denies** the
 *   operation (the thrown error's message is the reason) — consistent with how
 *   the core already denies via `ReadonlyError`/`FlagValidationError`. Multiple
 *   `before` hooks run **sequentially in declared order**; the first throw
 *   aborts and nothing commits. This is the enforcement primitive that
 *   governance and test-gating build on.
 * - **`after`** runs *after* a mutation commits. It is for side effects
 *   (webhooks, notifications, cache purges). An `after` hook **must never fail
 *   the operation** — the mutation already committed — so errors are isolated
 *   and reported via `onHookError`, not rethrown.
 *
 * Not to be confused with **OpenFeature's own Hooks**, which run client-side in
 * the SDK around a single evaluation. These are server-side, control-plane
 * hooks around admin mutations. A separate best-effort evaluation sink (for
 * usage/exposure) is intentionally *not* part of this contract — it belongs on
 * the runtime plane, off the evaluation hot path.
 *
 * @module
 */

import {
  createHookErrorReporter,
  type HookErrorReporter as KitHookErrorReporter,
  type Hooks,
  type HooksInput,
} from "@xtandard/kit/hooks";
import type { Actor, AuditEntry, Draft, Flag, Segment, Snapshot } from "../schema.ts";

/**
 * Event delivered to {@link FlagsHooks.before} — the *proposed* mutation, before
 * it commits. Throw from the handler to deny it.
 */
export type BeforeEvent =
  | { type: "flag.upsert"; projectKey: string; environmentKey: string; flag: Flag }
  | { type: "flag.delete"; projectKey: string; environmentKey: string; flagKey: string }
  | {
      type: "flag.archive" | "flag.restore";
      projectKey: string;
      environmentKey: string;
      flagKey: string;
      flag: Flag;
    }
  | { type: "segment.upsert"; projectKey: string; environmentKey: string; segment: Segment }
  | { type: "segment.delete"; projectKey: string; environmentKey: string; segmentKey: string }
  | {
      type: "publish";
      projectKey: string;
      environmentKey: string;
      /** The working draft about to be compiled + published. */
      draft: Draft;
      /** The env's reusable segments (raw, unresolved) — for gates that evaluate the draft. */
      segments: Record<string, Segment>;
      actor: Actor | null;
      message?: string;
    }
  | {
      type: "rollback";
      projectKey: string;
      environmentKey: string;
      /** The version being rolled back to. */
      toVersion: string;
      /** The currently-active version being replaced, if any. */
      fromVersion?: string;
      actor: Actor | null;
      message?: string;
    }
  | {
      /** A manual snapshot deletion (retention pruning is not vetoable and skips `before`). */
      type: "snapshot.delete";
      projectKey: string;
      environmentKey: string;
      version: string;
      actor: Actor | null;
    };

/**
 * Event delivered to {@link FlagsHooks.after} — the *committed* mutation. Carries
 * the resulting state (e.g. the stamped flag, the published snapshot).
 */
export type AfterEvent =
  | {
      type: "flag.upserted" | "flag.archived" | "flag.restored";
      projectKey: string;
      environmentKey: string;
      flag: Flag;
      at: string;
    }
  | {
      type: "flag.deleted";
      projectKey: string;
      environmentKey: string;
      flagKey: string;
      at: string;
    }
  | {
      type: "segment.upserted";
      projectKey: string;
      environmentKey: string;
      segment: Segment;
      at: string;
    }
  | {
      type: "segment.deleted";
      projectKey: string;
      environmentKey: string;
      segmentKey: string;
      at: string;
    }
  | {
      type: "published";
      projectKey: string;
      environmentKey: string;
      snapshot: Snapshot;
      actor: Actor | null;
      message?: string;
      at: string;
    }
  | {
      type: "rolledback";
      projectKey: string;
      environmentKey: string;
      version: string;
      fromVersion?: string;
      actor: Actor | null;
      message?: string;
      at: string;
    }
  | {
      /**
       * A snapshot's payload was removed (manual delete or retention pruning).
       * Carries the **full snapshot** — this event is the last chance to offload
       * it (S3, warehouse, SIEM) before it is gone from storage.
       */
      type: "snapshot.deleted";
      projectKey: string;
      environmentKey: string;
      version: string;
      snapshot: Snapshot;
      /** True when removed by retention policy rather than an explicit delete. */
      pruned: boolean;
      actor: Actor | null;
      at: string;
    }
  | {
      /**
       * Audit entries were removed by retention policy. Carries the **removed
       * entries** (oldest-first) — the last chance to offload them.
       */
      type: "audit.pruned";
      projectKey: string;
      environmentKey: string;
      entries: AuditEntry[];
      at: string;
    };

/** The discriminant strings of {@link BeforeEvent} / {@link AfterEvent}. */
export type BeforeEventType = BeforeEvent["type"];
export type AfterEventType = AfterEvent["type"];

/**
 * The hooks runner is `@xtandard/kit/hooks`: `HookDeniedError` (thrown from a
 * `before` hook to deny a mutation with a clean HTTP status, default `403`),
 * `normalizeHooks`, `runBefore` (sequential; the first throw aborts) and
 * `runAfter` (concurrent; errors are isolated and reported).
 */
export { HookDeniedError, normalizeHooks, runAfter, runBefore } from "@xtandard/kit/hooks";

/**
 * A control-plane hook. Implement `before`, `after`, or both. Pass one — or an
 * array — to `createFlagsCore` via `hooks`. `before` runs before a mutation
 * commits (**throw to deny**); `after` runs once it has committed, for side
 * effects only (errors are isolated and reported via `onHookError`).
 */
export type FlagsHooks = Hooks<BeforeEvent, AfterEvent>;

/** Accepts a single hook, an array, or nothing. */
export type FlagsHooksInput = HooksInput<BeforeEvent, AfterEvent>;

/** Reports an error thrown by an `after` hook. */
export type HookErrorReporter = KitHookErrorReporter<AfterEvent>;

/** Default `after`-hook error reporter: warn, but never throw. */
export const defaultHookErrorReporter: HookErrorReporter =
  createHookErrorReporter("@xtandard/flags");
