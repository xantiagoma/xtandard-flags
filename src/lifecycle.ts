/**
 * Flag lifecycle / staleness helpers.
 *
 * Pure, dependency-free utilities for spotting flags that have outlived their
 * {@link Flag.lifecycle} policy and look idle — a hint to clean them up.
 * **Organizational only**: never consulted by the evaluator, never part of the
 * compiled snapshot, and never enables/disables/archives a flag. The dashboard's
 * "stale" badge and health score are the only things that read this.
 *
 * Vocabulary:
 * - **expiry** — when a flag is *past its expected lifetime* (a duration from
 *   `createdAt`/`updatedAt`, or an absolute datetime deadline).
 * - **idle** — how long since the flag was last edited (`updatedAt`).
 * - **stale** — the verdict: for a duration expiry, *past expiry AND idle longer
 *   than the grace*; for a datetime expiry, simply *past the deadline*.
 *
 * @module
 */

import type { Flag, FlagDuration, LifecyclePolicy } from "./schema.ts";

const MS_PER_DAY = 86_400_000;
const MS_PER: Record<FlagDuration["unit"], number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: MS_PER_DAY,
};

/** A duration in milliseconds, or `null` if malformed. */
function durationMs(d: FlagDuration | undefined): number | null {
  if (!d || typeof d.value !== "number" || !Number.isFinite(d.value)) return null;
  const per = MS_PER[d.unit];
  return per ? d.value * per : null;
}

/** Options for {@link flagStaleness} / {@link summarizeLifecycle}. */
export interface StalenessOptions {
  /** Reference "now" (Date or ISO string). Defaults to the current time. */
  now?: Date | string;
  /** Default idle grace (days) when a flag's policy omits `idle`. Default `7`. */
  idleDays?: number;
}

/** Lifecycle assessment of a single flag. */
export interface FlagStaleness {
  /** True when the flag is past its expiry (and, for duration expiry, idle) and not archived. */
  stale: boolean;
  /** Whole days since {@link Flag.createdAt}, or `null` if it was never stamped. */
  ageDays: number | null;
  /** Whole days since {@link Flag.updatedAt} (falling back to `createdAt`), or `null`. */
  idleDays: number | null;
}

function toDate(value: Date | string | undefined | null): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function wholeDaysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / MS_PER_DAY);
}

/** The anchor timestamp (ms) a duration expiry counts from, or `null` if unavailable. */
function anchorMs(flag: Flag, from: "createdAt" | "updatedAt"): number | null {
  const iso = from === "updatedAt" ? (flag.updatedAt ?? flag.createdAt) : flag.createdAt;
  return toDate(iso)?.getTime() ?? null;
}

/** Whether the flag is past its expiry, and whether the idle grace gates that verdict. */
function pastExpiry(
  policy: LifecyclePolicy,
  flag: Flag,
  nowMs: number,
): { reached: boolean; idleGated: boolean } {
  const expiry = policy.expiry;
  if (expiry.kind === "datetime") {
    const at = toDate(expiry.at)?.getTime() ?? null;
    // Absolute deadline: a hard expiry, not gated by idle.
    return { reached: at != null && nowMs > at, idleGated: false };
  }
  const anchor = anchorMs(flag, expiry.from);
  const ms = durationMs(expiry);
  if (anchor == null || ms == null) return { reached: false, idleGated: true };
  return { reached: nowMs - anchor > ms, idleGated: true };
}

/**
 * Assess one flag's staleness against its {@link Flag.lifecycle} policy.
 *
 * - **Duration expiry** → stale when **not archived**, past the duration from its
 *   anchor (`createdAt`/`updatedAt`), **and** idle longer than the policy's `idle`
 *   grace (default {@link StalenessOptions.idleDays}, 7 days).
 * - **Datetime expiry** → stale when **not archived** and past the deadline (idle
 *   is ignored — it's a hard deadline).
 *
 * Flags without a `lifecycle` policy are never stale (opt-in).
 *
 * @example
 * ```ts
 * import { flagStaleness } from "@xtandard/flags";
 *
 * const { stale, ageDays } = flagStaleness(flag, { now: "2026-06-29T00:00:00Z" });
 * ```
 */
export function flagStaleness(flag: Flag, options: StalenessOptions = {}): FlagStaleness {
  const nowMs = (toDate(options.now) ?? new Date()).getTime();
  const created = toDate(flag.createdAt)?.getTime() ?? null;
  const idleRef = toDate(flag.updatedAt)?.getTime() ?? created;
  const ageDays = created != null ? wholeDaysBetween(created, nowMs) : null;
  const idleDays = idleRef != null ? wholeDaysBetween(idleRef, nowMs) : null;

  let stale = false;
  if (!flag.archivedAt && flag.lifecycle) {
    const { reached, idleGated } = pastExpiry(flag.lifecycle, flag, nowMs);
    if (reached) {
      if (!idleGated) {
        stale = true; // datetime deadline — hard expiry
      } else {
        const graceMs = durationMs(flag.lifecycle.idle) ?? (options.idleDays ?? 7) * MS_PER_DAY;
        stale = idleRef != null && nowMs - idleRef > graceMs;
      }
    }
  }

  return { stale, ageDays, idleDays };
}

/** Aggregate lifecycle health across a set of flags. */
export interface LifecycleSummary {
  total: number;
  active: number;
  archived: number;
  stale: number;
  /** 0–100; share of active flags that are not stale. `100` when there are no active flags. */
  healthScore: number;
}

/**
 * Summarize lifecycle health across many flags — counts plus a 0–100 health
 * score (the share of active flags that are not stale).
 *
 * @example
 * ```ts
 * import { summarizeLifecycle } from "@xtandard/flags";
 *
 * const { stale, healthScore } = summarizeLifecycle(flags);
 * ```
 */
export function summarizeLifecycle(
  flags: Flag[],
  options: StalenessOptions = {},
): LifecycleSummary {
  let active = 0;
  let archived = 0;
  let stale = 0;
  for (const flag of flags) {
    if (flag.archivedAt) {
      archived++;
      continue;
    }
    active++;
    if (flagStaleness(flag, options).stale) stale++;
  }
  const healthScore = active === 0 ? 100 : Math.round((100 * (active - stale)) / active);
  return { total: flags.length, active, archived, stale, healthScore };
}
