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

import type { Actor, Draft, Flag, Segment, Snapshot } from "../schema.ts";

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
    };

/** The discriminant strings of {@link BeforeEvent} / {@link AfterEvent}. */
export type BeforeEventType = BeforeEvent["type"];
export type AfterEventType = AfterEvent["type"];

/**
 * Thrown from a {@link FlagsHooks.before} handler to **deny** a mutation with a
 * clean HTTP status (default `403`). Any thrown error denies the mutation, but
 * a plain `Error` maps to `500` at the API layer (treated as an unexpected
 * bug); throw this to signal a deliberate policy rejection (`403`, or a custom
 * `status` such as `409`/`422`).
 *
 * @example
 * ```ts
 * before(event) {
 *   if (event.type === "publish" && isFrozen()) {
 *     throw new HookDeniedError("Publishing is frozen until Jan 2.");
 *   }
 * }
 * ```
 */
export class HookDeniedError extends Error {
  /** HTTP status the API layer should respond with. Default `403`. */
  readonly status: number;
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "HookDeniedError";
    this.status = options?.status ?? 403;
  }
}

/**
 * A control-plane hook. Implement `before`, `after`, or both. Pass one — or an
 * array — to {@link ../core.createFlagsCore} via `hooks`.
 */
export interface FlagsHooks {
  /**
   * Runs before a mutation commits. **Throw to deny** (the error propagates to
   * the caller; its message is the reason). Return/resolve to allow. Must not
   * mutate the event payload.
   */
  before?(event: BeforeEvent): void | Promise<void>;
  /**
   * Runs after a mutation commits. For side effects only. Errors are isolated
   * and reported via `onHookError` — they never fail the (already committed)
   * operation.
   */
  after?(event: AfterEvent): void | Promise<void>;
}

/** Accepts a single hook, an array, or nothing. */
export type FlagsHooksInput = FlagsHooks | readonly FlagsHooks[] | undefined;

/** Reports an error thrown by an `after` hook. */
export type HookErrorReporter = (error: unknown, event: AfterEvent) => void;

/** Normalize the `hooks` option into a flat array (empty when unset). */
export function normalizeHooks(input: FlagsHooksInput): FlagsHooks[] {
  if (!input) return [];
  return Array.isArray(input) ? [...input] : [input as FlagsHooks];
}

/**
 * Run every `before` hook sequentially, in order. The first hook to throw
 * aborts: the error propagates to the caller (denying the mutation) and no
 * later hook runs. A no-op when there are no `before` hooks.
 */
export async function runBefore(hooks: FlagsHooks[], event: BeforeEvent): Promise<void> {
  for (const hook of hooks) {
    if (hook.before) await hook.before(event);
  }
}

/**
 * Run every `after` hook, isolating failures. The mutation has already
 * committed, so a throwing hook must not fail the operation — its error is
 * routed to `onError` and swallowed. Remaining hooks still run.
 */
export async function runAfter(
  hooks: FlagsHooks[],
  event: AfterEvent,
  onError: HookErrorReporter,
): Promise<void> {
  await Promise.all(
    hooks.map(async (hook) => {
      if (!hook.after) return;
      try {
        await hook.after(event);
      } catch (error) {
        onError(error, event);
      }
    }),
  );
}

/** Default `after`-hook error reporter: warn, but never throw. */
export const defaultHookErrorReporter: HookErrorReporter = (error, event) => {
  // eslint-disable-next-line no-console
  console.warn(`[@xtandard/flags] after-hook for "${event.type}" threw:`, error);
};
