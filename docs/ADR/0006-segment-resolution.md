# ADR 0006 — Segment Resolution: inline `inSegment`, embed for `notInSegment`

**Status:** Accepted

---

## Context

Reusable **segments** are named audiences (an AND of conditions) referenced by
targeting rules. Rules in this system are a **flat AND** of conditions, and the
runtime evaluator is intentionally tiny (pure, synchronous, zero-dep — see
[ADR 0002](./0002-memory-first-runtime-evaluation.md)).

`inSegment` was originally resolved by **inlining**: at publish, a segment's
conditions are spliced into the rule's AND list, so the evaluator never sees
`inSegment` and stays segment-agnostic. That works precisely because "member of
segment S" = "S's conditions, ANDed in."

Then we needed **`notInSegment`** ("everyone except internal staff"). Negating a
segment is `NOT(c1 AND c2)` = `NOT c1 OR NOT c2` — an **OR**. You cannot splice an
OR into a flat AND list, so inlining can't express it.

## Decision

Keep `inSegment` **inlined** (unchanged — lean snapshots, no evaluator change),
and resolve `notInSegment` at **runtime** against segments embedded in the snapshot:

- `compileDraft` inlines `inSegment` as before. If any flag (post-inline) uses
  `notInSegment`, it embeds the **resolved** segments (their own `inSegment`
  inlined) into `Snapshot.segments` — and _only_ then, so snapshots stay lean
  when the feature is unused.
- The evaluator gains an optional segments map:
  `evaluateFlag(flag, context, allFlags?, segments?)`. `matchesSegment(key, …)`
  checks membership (AND of the segment's conditions); `notInSegment` returns its
  negation. A `seen` set guards cyclic references (fail closed), so recursion
  always terminates even though publish-time validation already rejects dangling
  `notInSegment` refs.
- The provider passes `snapshot.segments`; `core.evaluate` resolves draft segments
  on the fly for pre-publish test targeting.

## Consequences

- **`notInSegment` works** without giving up the inline optimization for the common
  `inSegment` case; snapshots only carry segments when `notInSegment` is used.
- **The evaluator now optionally takes a segments map** — still pure/zero-dep, still
  never throws. `inSegment` is also handled there defensively (in case a snapshot
  ever embeds it), though it remains inlined in practice.
- **OR across audiences still isn't a single condition.** Real OR is expressed with
  multiple rules (first match wins). A future "any of these segments" or richer
  segment builder would build on this embed-and-evaluate path rather than inlining.
- **Cycles via `notInSegment`** are safe at runtime (guarded) rather than forbidden
  outright; only dangling references are a publish error.

## Update (2026-06-30) — multi-segment OR via an array value

The "OR across audiences" gap above is now closed for the in-condition case:
`inSegment` / `notInSegment` accept **a single key or an array of keys**.

- `inSegment: [A, B]` → member of **any** (OR); `notInSegment: [A, B]` → in **none**.
- A **single-key `inSegment`** is still inlined (unchanged — lean snapshots). An
  **array `inSegment`** is an OR that can't be inlined into a flat AND, so it takes
  the same embed-and-evaluate path as `notInSegment`. Embedding now triggers on
  `usesEmbeddedSegments` (notInSegment **or** array inSegment), not just notInSegment.
- The evaluator resolves both via `inAnySegment(value, …)` (match any listed key,
  cycle-guarded); `notInSegment` is its negation. Validation accepts a non-empty key
  or non-empty array of non-empty keys; dangling keys (incl. inside an array) are a
  publish error. The UI segment picker became a chip multi-select.
- This is OR **within one condition**; separate conditions still AND. For arbitrary
  cross-attribute OR/nested logic, the `matches` operator ([ADR 0008](./0008-query-matchers.md))
  is the general tool. A richer visual segment/boolean builder remains future work.
