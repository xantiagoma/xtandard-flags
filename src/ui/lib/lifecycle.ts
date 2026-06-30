import type { Flag, FlagDuration } from "../types.ts";

// Mirror of the package's `flagStaleness` (src/lifecycle.ts), kept dependency-free
// for the bundled SPA. A flag is stale (advisory only — no behavior change) when it
// is not archived and past its lifecycle expiry: a duration expiry also requires the
// flag to be idle (untouched) longer than the grace; a datetime expiry is a hard
// deadline (idle ignored). No lifecycle policy → never stale.
const MS_PER_DAY = 86_400_000;
const MS_PER: Record<FlagDuration["unit"], number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: MS_PER_DAY,
};
const durationMs = (d?: FlagDuration): number | null =>
  d && Number.isFinite(d.value) && MS_PER[d.unit] ? d.value * MS_PER[d.unit] : null;
const ms = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

export function isStale(flag: Flag, defaultIdleDays = 7, now = Date.now()): boolean {
  if (flag.archivedAt || !flag.lifecycle) return false;
  const { expiry, idle } = flag.lifecycle;

  if (expiry.kind === "datetime") {
    const at = ms(expiry.at);
    return at != null && now > at; // hard deadline
  }

  const anchor = ms(
    expiry.from === "updatedAt" ? (flag.updatedAt ?? flag.createdAt) : flag.createdAt,
  );
  const lifeMs = durationMs(expiry);
  if (anchor == null || lifeMs == null || now - anchor <= lifeMs) return false;

  // Past the duration → also require idle longer than the grace.
  const idleRef = ms(flag.updatedAt ?? flag.createdAt);
  const graceMs = durationMs(idle) ?? defaultIdleDays * MS_PER_DAY;
  return idleRef != null && now - idleRef > graceMs;
}

export function staleCount(flags: Flag[], now = Date.now()): number {
  return flags.reduce((n, f) => n + (isStale(f, 7, now) ? 1 : 0), 0);
}

/**
 * The flag's scheduled-window status right now: `"expired"` (past `disableAt`),
 * `"scheduled"` (before `enableAt`), or `null` (live / no window). Mirrors the
 * evaluator's `scheduleState`.
 */
export function scheduleStatus(flag: Flag, now = Date.now()): "scheduled" | "expired" | null {
  const s = flag.schedule;
  if (!s) return null;
  const end = ms(s.disableAt);
  if (end != null && now > end) return "expired";
  const start = ms(s.enableAt);
  if (start != null && now < start) return "scheduled";
  return null;
}
