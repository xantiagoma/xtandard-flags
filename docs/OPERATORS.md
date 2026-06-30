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
(`compareValues → -1|0|1`, `undefined` = incomparable → `false`), with four tiers:

0. **Registered comparators** (highest precedence) — for value-object types that
   **don't** follow the static-`compare`/`from` convention of tier 1 (e.g.
   [Dinero.js](https://dinerojs.com), Decimal.js, BigNumber). Register a predicate
   plus a `compare` (and optional `parser`) via `registerComparator`; see
   [**Custom comparators**](#custom-comparators) below. A matched comparator **owns**
   the comparison — if it throws, the condition fails closed rather than falling
   through to numeric coercion that would misread the object.
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

## Custom comparators

For value-object types that don't expose a `Temporal`-style static `compare`/`from`
(tier 1) or a numeric `valueOf` (tier 3) — most money/decimal libraries — register
a comparator. A predicate decides which values it owns; `compare` orders them; an
optional `parser` lifts the **other** operand (typically the JSON-stored condition
`value`) into the comparable type first. Everything is request-path safe: a throwing
predicate or `compare` fails the operand pair **closed**, never propagating.

```ts
import { registerComparator } from "@xtandard/flags";
import { dinero, lessThan, equal, type Dinero } from "dinero.js";

const isDinero = (v: unknown): v is Dinero<number> =>
  typeof v === "object" && v !== null && "calculator" in v && "toJSON" in v;

registerComparator(isDinero, {
  compare: (a, b) => (equal(a, b) ? 0 : lessThan(a, b) ? -1 : 1),
  parser: (raw) => dinero(raw as Parameters<typeof dinero>[0]),
});
```

Registered comparators also back **equality** (`equals`/`notEquals`/`in`/`notIn`)
through `compareValues === 0`, so the same registration handles ordering and
membership. Comparison runs entirely **in-process** on the live context value — so
there's no OpenFeature constraint to work around; the only boundary is that the
stored condition `value` must stay JSON (which is what `parser` reconstructs from).

Two layers, both available:

- **Global default** — `registerComparator(predicate, handlers)` mutates a
  process-wide registry consulted by every evaluation (including the bare
  `evaluateFlag`). Returns a dispose function; `clearComparators()` resets all.
- **Per-instance override** — pass `comparators` (a `Map` or array of
  `[predicate, handlers]` tuples) to `createOpenFeatureProvider({ comparators })`
  or `createFlagsCore({ comparators })`. Instance entries layer **over** the global
  default for that instance's evaluations. `withComparators(registry, fn)` exposes
  the same synchronous scoping directly.

## Segments & prerequisites

- **`inSegment`** is resolved by _inlining_ the segment's conditions into the rule
  at publish time — the runtime evaluator never sees it.
- **`notInSegment`** can't be inlined (negating an AND is an OR), so the resolved
  segments are embedded in `Snapshot.segments` and the evaluator checks membership;
  cyclic references are guarded (fail closed). Dangling refs are rejected at publish.
- **Prerequisites** (`flag.prerequisites`) gate a flag on other flags resolving to a
  required variant; the dependency graph is validated acyclic at publish.
