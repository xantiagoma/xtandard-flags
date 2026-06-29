/**
 * Flag lifecycle / staleness helpers.
 *
 * Pure, dependency-free utilities for spotting flags that have outlived their
 * {@link Flag.expectedLifetimeDays} and look idle — a hint to clean them up.
 * Organizational only: never consulted by the evaluator and not part of the
 * compiled snapshot's behavior.
 *
 * @module
 */

import type { Flag } from "./schema.ts";

const MS_PER_DAY = 86_400_000;

/** Options for {@link flagStaleness} / {@link summarizeLifecycle}. */
export interface StalenessOptions {
  /** Reference "now" (Date or ISO string). Defaults to the current time. */
  now?: Date | string;
  /** Idle threshold in days: a flag untouched longer than this is "idle". Default `7`. */
  idleDays?: number;
}

/** Lifecycle assessment of a single flag. */
export interface FlagStaleness {
  /** True when the flag is past its expected lifetime and idle (and not archived). */
  stale: boolean;
  /** Whole days since {@link Flag.createdAt}, or `null` if it was never stamped. */
  ageDays: number | null;
  /** Whole days since {@link Flag.updatedAt} (falling back to `createdAt`), or `null`. */
  idleDays: number | null;
}

function toDate(value: Date | string | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Assess one flag's staleness.
 *
 * A flag is stale when it is **not archived**, has an `expectedLifetimeDays`,
 * is older than that, and has been idle longer than {@link StalenessOptions.idleDays}
 * (default 7). Flags without an `expectedLifetimeDays` are never stale (opt-in).
 *
 * @example
 * ```ts
 * import { flagStaleness } from "@xtandard/flags";
 *
 * const { stale, ageDays } = flagStaleness(flag, { now: "2026-06-29T00:00:00Z" });
 * ```
 */
export function flagStaleness(flag: Flag, options: StalenessOptions = {}): FlagStaleness {
  const now = toDate(options.now) ?? new Date();
  const idleThreshold = options.idleDays ?? 7;

  const created = toDate(flag.createdAt);
  const idleRef = toDate(flag.updatedAt) ?? created;
  const ageDays = created ? wholeDaysBetween(created, now) : null;
  const idleDays = idleRef ? wholeDaysBetween(idleRef, now) : null;

  const stale =
    !flag.archivedAt &&
    flag.expectedLifetimeDays != null &&
    ageDays != null &&
    ageDays > flag.expectedLifetimeDays &&
    idleDays != null &&
    idleDays > idleThreshold;

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
