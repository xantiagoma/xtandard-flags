# Condition Operators

Targeting rules and segments are an **AND** of conditions. Each condition reads a
context **attribute** and compares it to a stored **value**. Conditions **never
throw** — a type mismatch evaluates to `false`. Across rules, first match wins.

| Operator                                            | Meaning                                    | Notes                                                                                       |
| --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `equals` / `notEquals`                              | single-value match                         | loose across primitive types (`1` == `"1"`); value objects/bigint via `compareValues === 0` |
| `in` / `notIn`                                      | membership in a list                       | chip input in the UI; same equality as `equals`                                             |
| `inSegment`                                         | member of a reusable segment               | `value` = segment key; **inlined at compile time**                                          |
| `notInSegment`                                      | **not** a member of a segment              | embedded in the snapshot (can't inline a negated AND); cycle-guarded                        |
| `contains` / `notContains`                          | array includes value, or string substring  |                                                                                             |
| `startsWith` / `endsWith`                           | string prefix / suffix                     | attribute must be a string                                                                  |
| `exists` / `notExists`                              | attribute present (not `null`/`undefined`) | no value needed                                                                             |
| `greaterThan` `>=` `lessThan` `<=`                  | ordering                                   | see **comparable coercion** below                                                           |
| `before` / `after`                                  | date/time ordering                         | semantic alias for ordering on dates                                                        |
| `semverEquals` `semverGreaterThan` `semverLessThan` | semver compare                             | `10.0.0 > 2.0.0`; prerelease < release; invalid → `false`                                   |

## Comparable coercion (`>`, `>=`, `<`, `<=`, `before`, `after`)

Ordering operators use a single zero-dependency, never-throws comparator
(`compareValues → -1|0|1`, `undefined` = incomparable → `false`), with three tiers:

1. **Value objects** — if a side is an object whose **constructor** exposes a static
   `compare(a, b)`, it parses the other side to that type (static
   `from`/`fromString`/`fromJSON`/`parse`, falling back to `new Klass(v)` then
   `Klass(v)`) and compares. The class is read straight off the instance
   (`value.constructor`) — **no `globalThis.Temporal` lookup, no hardcoded type
   list** — so it covers the whole Temporal family (`Instant`,
   `ZonedDateTime`, `PlainDateTime`, `PlainDate`, `PlainTime`, `PlainYearMonth`,
   `Duration`) **and any custom Comparable** following the same convention. This is
   how **epoch-less** types are ordered correctly, e.g. a `Temporal.Duration` of 50
   minutes vs the stored string `"PT1H"`. (`PlainMonthDay` has no `compare`, so it
   isn't orderable; a `Duration` with **calendar** units like `P1M` needs
   `relativeTo` → fails closed — **time-unit** durations like `PT1H` compare directly.)
2. **BigInt** — exact `bigint` ordering (beyond `Number` precision); mixed
   `bigint`/number compares by magnitude.
3. **Numeric scalar** (`toComparable`) — numbers, numeric strings, **ISO-8601 date
   strings** (`Date.parse` → epoch ms), `Date` instances, and any object with a
   numeric `valueOf`/`Symbol.toPrimitive`.

So `count > 100`, `lastSeen after "2026-01-01"`, `signupTs > <epoch>`,
`appBuild > 9007199254740993n`, and a `Temporal.PlainDate` context value vs an ISO
threshold all work. Custom _Comparable_ types participate via either the standard
`valueOf` hook (tier 3) or a `Temporal`-style static `compare`/`from`. The evaluator
never guesses arbitrary method names, so the request path stays pure.

> Note on context shape: over HTTP (OFREP/bootstrap) the evaluation context is
> JSON, so rich types arrive as strings/numbers (tier 3). The **in-process**
> OpenFeature provider receives a live JS object, so `Date`/`Temporal`/`bigint`
> instances are compared directly (tiers 1–2). The stored condition `value` is
> always a JSON primitive, parsed to the matching type as needed.

## Segments & prerequisites

- **`inSegment`** is resolved by _inlining_ the segment's conditions into the rule
  at publish time — the runtime evaluator never sees it.
- **`notInSegment`** can't be inlined (negating an AND is an OR), so the resolved
  segments are embedded in `Snapshot.segments` and the evaluator checks membership;
  cyclic references are guarded (fail closed). Dangling refs are rejected at publish.
- **Prerequisites** (`flag.prerequisites`) gate a flag on other flags resolving to a
  required variant; the dependency graph is validated acyclic at publish.
