# ADR 0008 — Query Matchers: `matches` / `notMatches` via a Pluggable Engine

**Status:** Accepted

---

## Context

Targeting rules and segments are a **flat AND** of conditions ([ADR 0006](./0006-segment-resolution.md)),
and the runtime evaluator is intentionally tiny — pure, synchronous, zero-dep
([ADR 0002](./0002-memory-first-runtime-evaluation.md)). That model can't express
**OR / nested boolean logic** in a single condition: "pro plan AND (seats > 10 OR
role = admin)" needs multiple rules, and there's no general predicate over arbitrary
context shape.

Two asks pointed at the same gap: support a MongoDB-style query engine
([sift](https://github.com/crcn/sift.js) / [mingo](https://github.com/kofrasa/mingo))
against the context, and/or schema-style validation (zod/valibot/arktype). The key
question was whether to overload `equals`/`notEquals` and whether OpenFeature
restricts it.

Two facts settled the design. **(1) A query is data; a schema is code.** A sift/mingo
filter is a plain JSON object — it serializes into the snapshot like any condition
`value`. A zod schema is functions — it can't be stored, so it can only be a matcher
_registered in code_ that a condition references by name. **(2) No OpenFeature
constraint.** Matching runs in-process on the live context (the same reason
[ADR 0007](./0007-pluggable-comparators.md)'s comparators work); nothing crosses the
SDK boundary. The only boundary is that the stored query must be JSON.

## Decision

Add a dedicated operator pair `matches` / `notMatches` (not an overload of `equals`,
which has precise primitive/value-object semantics) and a **pluggable, named matcher
registry** mirroring the comparator registry:

- `condition.value` is a JSON **query document**; `condition.matcher` names the
  engine (defaults to `"default"`). The subject is `context[attribute]` when an
  attribute is named, else the **whole context** — which is what unlocks OR/nested
  logic and cross-attribute queries (sift expresses sub-paths in the query itself).
- `registerMatcher(name, fn)` populates a process-wide registry; a `matchers` option
  (`Map` / `Record` / tuples) on `createOpenFeatureProvider` / `createFlagsCore`
  layers an instance set over it, scoped synchronously via `withMatchers`.
  `MatcherFn = (query, subject, context) => boolean`.
- **Fail-closed, never-throws:** an unregistered matcher, a non-object query, or a
  matcher that throws makes **both** operators evaluate to `false` — the rule never
  fires on a broken or absent matcher rather than guessing. A clean `false` makes
  `notMatches` true.
- **Two matchers ship:** a built-in **`regex`** (zero-dep, native `RegExp`, always
  resolvable from a non-clearable built-ins map — user registrations of the same
  name shadow it), and **`sift`** behind the `@xtandard/flags/match/sift` subpath
  with `sift` as an optional peer dependency (the core stays zero-dep, same pattern
  as `storage/postgres`).
- **Validation:** `matches`/`notMatches` require a JSON **object** query (attribute
  optional); semantic check lives beside the `inSegment` per-operator checks.

## Consequences

- **Arbitrary boolean logic in one condition** — the practical answer to the "no OR
  in the flat-AND model" gap, complementary to segments, with no evaluator rewrite.
- **The core stays zero-dep and never-throws.** Query engines are opt-in: `regex`
  rides native `RegExp`; `sift`/`mingo`/custom are registered by the host.
- **Schema validators fit via the same mechanism** — a named matcher closing over a
  zod/valibot/arktype schema in code; the stored query carries only JSON params.
- **Authoring is free-form JSON.** The admin UI offers a JSON editor + matcher-name
  field; it can't statically validate engine-specific operators (the publishing
  process may not have the matcher). Unknown/never-registered matchers simply don't
  fire at eval — predictable, but a `matches` rule is only as good as the resolver's
  registrations.
- **Module-level + scoped registry**, same trade as comparators: a synchronous
  dynamic scope (`withMatchers`) localizes per-instance behavior without threading a
  parameter through the deep evaluator call chain.
