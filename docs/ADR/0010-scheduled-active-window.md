# ADR 0010 — Scheduled Active Window (time-aware evaluation)

**Status:** Accepted

---

## Context

Flags often want a **time box**: turn on for a launch window, auto-off after a
promo, go live at a future instant. Until now the only "off" was the manual
`enabled` toggle, and the advisory `lifecycle` policy ([ADR 0009-adjacent] stale
detection) explicitly _doesn't_ change behavior.

The evaluator has been **pure and deterministic** since [ADR 0002](./0002-memory-first-runtime-evaluation.md):
`evaluate(flag, context)` returns the same result regardless of wall-clock time.
A scheduled window inherently depends on "now", so supporting it requires a
deliberate change to that contract.

Two ways to enforce a window in a memory-first system:

1. **Evaluator short-circuit** — the evaluator compares the current time to the
   window and serves the default variant when outside it.
2. **Control-plane scheduled sweep** — a cron flips `enabled=false` at the
   boundary and re-publishes.

## Decision

Add an optional **active window** and enforce it in the **evaluator** (option 1):

```ts
interface Flag {
  schedule?: { enableAt?: string; disableAt?: string }; // ISO instants, both optional
}
```

- Outside the window the flag serves its **default variant** with a new reason:
  `SCHEDULED` before `enableAt`, `EXPIRED` after `disableAt`. Manual `enabled:
false` still wins (reason `DISABLED`). Unparseable bounds are ignored (fail open).
- `evaluateFlag(flag, context, allFlags?, segments?, now = Date.now())` gains an
  optional `now`, threaded through prerequisite resolution. Production callers use
  the default; tests pass a fixed `now`.
- New OpenFeature reasons map to `DISABLED` (the flag is effectively off right now).
- Validation rejects `enableAt >= disableAt`. The admin UI offers two
  `datetime-local` inputs plus a live Active / Scheduled / Expired status badge.

### Why the evaluator, not a scheduler

The product's core promise is **memory-first, last-known-good** evaluation that
keeps working with no control plane reachable ([ADR 0002](./0002-memory-first-runtime-evaluation.md)).
A scheduler-based approach would:

- need a always-running control-plane cron (a Phase-E dependency we don't have),
- not fire at all for pure in-process / OFREP consumers whose control plane is
  offline, and
- introduce publish churn + a window where the snapshot is stale vs the clock.

The evaluator short-circuit "just works": it flips the instant the clock crosses
the boundary, offline, with no re-publish, and composes with prerequisites (an
expired prerequisite resolves to its default variant, which then fails the
dependent's prereq check).

## Consequences

- **The evaluator is now time-aware** — a documented, bounded departure from the
  pure-determinism of ADR 0002. Only flags that set `schedule` are affected; flags
  without it remain fully deterministic. `now` is injectable for testing.
- **`schedule` is behavioral**, unlike the advisory `lifecycle` policy — the two are
  intentionally separate: `lifecycle` nags (badge), `schedule` acts (serves default).
  Neither flips `enabled` or archives the flag.
- **No scheduler/infra** added; works in-process and over OFREP.
- **bootstrap** (precomputed values at fetch time) reflects the window state _at
  fetch_; the in-process provider and OFREP re-check on every evaluation.
- A future symmetric feature (scheduled rule/variant changes, approval-gated
  schedules) would build on this `now`-aware path rather than reintroduce purity.
