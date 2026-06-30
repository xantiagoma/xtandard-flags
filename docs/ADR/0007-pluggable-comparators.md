# ADR 0007 — Pluggable Comparators for Custom Value-Object Types

**Status:** Accepted

---

## Context

The ordering operators (`>`/`>=`/`<`/`<=`/`before`/`after`) and equality
(`equals`/`in`/…) go through one never-throws `compareValues` with three tiers
(see [docs/OPERATORS.md](../OPERATORS.md)): a constructor-duck-typed **value-object**
tier (static `compare` + static `from`/…), a **BigInt** tier, and a numeric-scalar
`valueOf` tier. That covers the whole Temporal family and any value object that
follows the `Temporal`-style static convention or exposes a numeric `valueOf`.

It does **not** cover value-object libraries that follow neither convention — the
common case being money/decimal types. [Dinero.js](https://dinerojs.com) is the
motivating example: a `dinero()` **factory** (no meaningful `constructor.compare`)
whose comparison lives in free functions (`lessThan(a, b)`, `equal(a, b)`), and
whose `valueOf` is not a single orderable scalar (amount + currency + scale). The
constructor-duck-typing can't see it, and numeric coercion would misread it.

A user asked whether a registry of `predicate → { serializer, parser?, compare? }`
handlers (à la `@xtandard/lib`'s codec options / superjson) could be supplied "when
initializing," and whether OpenFeature restricts it.

**OpenFeature does not restrict the comparison case.** Comparison runs entirely
in-process on the live context value (`actual`) and the flag's stored `value`
(`expected`); nothing crosses the SDK boundary. OpenFeature's context-attribute
type is advisory — a consumer can put a live Dinero object in the context and it
flows untouched into the evaluator. The only hard boundary is that the **stored
snapshot must remain JSON**, which a string `serializer` satisfies. We scoped the
first pass to **comparison only** (`compare` + optional `parser`); a serialize
round-trip for storing rich objects as condition/variant values is a possible
follow-up, not built here.

## Decision

Add `src/comparators.ts` — a zero-dep, never-throws registry consulted as **tier 0**
(highest precedence) of `compareValues`:

- `registerComparator(predicate, { compare, parser? })` mutates a **process-wide
  default** registry; returns a dispose function. `clearComparators()` resets it.
  Most-recently-registered wins on overlap; first match wins on lookup.
- `withComparators(registry, fn)` layers an **instance registry** (a `Map` or array
  of `[predicate, handlers]` tuples) **over** the global default for the duration of
  one **synchronous** evaluation, restoring the previous scope in a `finally`. This
  is a poor-man's dynamic scope — safe because the evaluator has no `await` between
  the scope set and its use.
- `createOpenFeatureProvider({ comparators })` and `createFlagsCore({ comparators })`
  accept the registry and wrap their `evaluateFlag` calls in `withComparators`. This
  satisfies the "global default **and** init override" model — global for casual use
  and the bare `evaluateFlag`; per-instance when two providers want different types.

A matched comparator **owns** the comparison: if its predicate matches an operand
but `compare` throws or returns non-finite, the result is "matched, no order" and
the condition fails **closed**, rather than falling through to numeric coercion that
would misread the value object. Predicates are called defensively (a throwing
predicate is treated as non-matching). Equality reuses this via `compareValues === 0`.

### Why a registry + dynamic scope rather than threading a parameter

`compareValues` sits many hops below `evaluateFlag` (`evaluateFlag → matchesRule →
evaluateCondition → compareValues`, plus `matchesSegment`/`resolveServe`). Threading
a registry parameter would touch every signature and break the back-compat,
positional `evaluateFlag(flag, context, allFlags?, segments?)` surface and its many
test/public call sites. A module-level registry consulted by `compareValues`, with a
synchronous scope wrapper for per-instance overrides, keeps the deep call chain and
the public signatures untouched.

## Consequences

- **Money/decimal and other non-conventional value objects now order and compare**
  correctly, via an explicit opt-in, without bloating the evaluator with library
  knowledge or hot-path dependencies.
- **The evaluator stays pure, zero-dep, and never-throws.** The registry adds one
  loop over a usually-empty list per comparison; tier 0 returns "no match" and falls
  through when nothing is registered, so existing behavior is unchanged.
- **Module-level global state** is a deliberate trade for not threading a parameter.
  The synchronous scope (`withComparators`) localizes per-instance behavior; it would
  leak across an `await`, but the evaluator is fully synchronous, so it doesn't.
- **Comparison only, for now.** Rich objects can be _compared_ (context side live,
  stored side parsed via `parser`) but are not _stored_ as rich values — the snapshot
  stays JSON. A superjson-style serialize round-trip for stored condition/variant
  values would build on this `predicate → handlers` shape (adding `serializer`).
- **No OpenFeature conflict.** Unlike serving evaluation from the control plane
  ([ADR 0004](./0004-ofrep-endpoint.md)), this changes nothing about _where_
  evaluation runs — it stays in-process, last-known-good
  ([ADR 0002](./0002-memory-first-runtime-evaluation.md)).
