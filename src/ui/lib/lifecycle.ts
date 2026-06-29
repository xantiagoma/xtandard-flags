import type { Flag } from "../types.ts";

// Mirror of the package's `flagStaleness` (src/lifecycle.ts), kept dependency-free
// for the bundled SPA. A flag is stale when it is not archived, has an expected
// lifetime, is older than it, and has been idle longer than `idleDays` (default 7).
const MS_PER_DAY = 86_400_000;
const wholeDays = (fromIso: string, now: number) =>
  Math.floor((now - new Date(fromIso).getTime()) / MS_PER_DAY);

export function isStale(flag: Flag, idleDays = 7, now = Date.now()): boolean {
  if (flag.archivedAt || flag.expectedLifetimeDays == null || !flag.createdAt) return false;
  const idleRef = flag.updatedAt ?? flag.createdAt;
  return (
    wholeDays(flag.createdAt, now) > flag.expectedLifetimeDays && wholeDays(idleRef, now) > idleDays
  );
}

export function staleCount(flags: Flag[], now = Date.now()): number {
  return flags.reduce((n, f) => n + (isStale(f, 7, now) ? 1 : 0), 0);
}
