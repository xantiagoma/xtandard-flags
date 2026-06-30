# Condition Operators

Targeting rules and segments are an **AND** of conditions. Each condition reads a
context **attribute** and compares it to a stored **value**. Conditions **never
throw** — a type mismatch evaluates to `false`. Across rules, first match wins.

| Operator                                            | Meaning                                    | Notes                                                                |
| --------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| `equals` / `notEquals`                              | single-value match                         | loose across primitive types (`1` == `"1"`)                          |
| `in` / `notIn`                                      | membership in a list                       | chip input in the UI; loose per item                                 |
| `inSegment`                                         | member of a reusable segment               | `value` = segment key; **inlined at compile time**                   |
| `notInSegment`                                      | **not** a member of a segment              | embedded in the snapshot (can't inline a negated AND); cycle-guarded |
| `contains` / `notContains`                          | array includes value, or string substring  |                                                                      |
| `startsWith` / `endsWith`                           | string prefix / suffix                     | attribute must be a string                                           |
| `exists` / `notExists`                              | attribute present (not `null`/`undefined`) | no value needed                                                      |
| `greaterThan` `>=` `lessThan` `<=`                  | ordering                                   | see **comparable coercion** below                                    |
| `before` / `after`                                  | date/time ordering                         | semantic alias for ordering on dates                                 |
| `semverEquals` `semverGreaterThan` `semverLessThan` | semver compare                             | `10.0.0 > 2.0.0`; prerelease < release; invalid → `false`            |

## Comparable coercion (`>`, `>=`, `<`, `<=`, `before`, `after`)

All ordering operators coerce both sides to one comparable scalar via a single
zero-dependency, never-throws helper (`toComparable`), in this order:

1. **numbers** and **numeric strings**
2. **ISO-8601 date strings** → epoch ms (built-in `Date.parse`)
3. **`Date`** instances and **`Temporal.Instant` / `Temporal.ZonedDateTime`** (their `epochMilliseconds`)
4. any object implementing the **standard JS coercion hook** (`Symbol.toPrimitive` / `valueOf`) that yields a finite number

So `count > 100`, `lastSeen after "2026-01-01"`, and `signupTs > <epoch>` all work,
and any custom _Comparable_ type that implements `valueOf` participates for free —
without the evaluator calling guessed method names (keeping the request path pure).

**Not comparable:** calendar/relative `Temporal` types (`PlainDate`, `Duration`)
expose no epoch and refuse numeric coercion, so they fail closed. Anything
unparseable → the condition is `false`.

> Note on context shape: over HTTP (OFREP/bootstrap) the evaluation context is
> JSON, so rich types arrive as strings/numbers. The **in-process** OpenFeature
> provider receives a live JS object, so `Date`/`Temporal` instances are compared
> directly. The stored condition `value` is always a JSON primitive.

## Segments & prerequisites

- **`inSegment`** is resolved by _inlining_ the segment's conditions into the rule
  at publish time — the runtime evaluator never sees it.
- **`notInSegment`** can't be inlined (negating an AND is an OR), so the resolved
  segments are embedded in `Snapshot.segments` and the evaluator checks membership;
  cyclic references are guarded (fail closed). Dangling refs are rejected at publish.
- **Prerequisites** (`flag.prerequisites`) gate a flag on other flags resolving to a
  required variant; the dependency graph is validated acyclic at publish.
