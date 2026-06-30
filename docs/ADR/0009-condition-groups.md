# ADR 0009 — AND/OR/NOT Condition Groups (recursive rule tree)

**Status:** Accepted

---

## Context

A targeting rule's `conditions` were a **flat AND** of leaf conditions; the only OR
was _across_ rules (first-match-wins, each rule serving its own variant), plus two
narrow conveniences added earlier — `inSegment [A,B]` (OR over segments in one
condition) and `matches` (arbitrary boolean logic, but via an external query engine
like sift). There was no native way to express `A AND (B OR C)` or `NOT(…)` in a
single rule.

The user already models this in `@xtandard/filters` as a recursive `FilterNode`
(`and` / `or` / `not` / leaf) with a filter-builder UI, and asked whether the
flat-AND limit was an OpenFeature constraint. **It is not** — OpenFeature defines no
rule/targeting/condition model at all (only the provider interface + evaluation
context); targeting logic is entirely ours. So nesting is purely a design choice.

## Decision

A node in a rule/segment `conditions` array is now a **leaf `Condition` or a boolean
`ConditionGroup`** — modeled on `@xtandard/filters`' `FilterNode`, adapted so the
leaf is our existing `Condition`:

```ts
type ConditionGroup =
  | { all: ConditionNode[] } // AND
  | { any: ConditionNode[] } // OR
  | { not: ConditionNode }; // NOT (negates a subtree)
type ConditionNode = Condition | ConditionGroup;
```

- The **top-level `conditions` array stays an implicit AND**, so a flat list of
  leaves behaves exactly as before — no migration of existing rules/segments.
- Groups **nest arbitrarily**. `evaluateNode` recurses: `all` → every child, `any`
  → some child, `not` → negation. Empty `all` matches; empty `any` / malformed group
  fails closed. Still pure, synchronous, never-throws.
- **Discrimination is structural** (`isConditionGroup` = has `all`/`any`/`not`), so
  leaves keep their exact shape — no `type` tag added to every condition. A
  `leafConditions` walker flattens the tree for the scans that only care about leaves
  (segment-reference collection/validation, embedded-segment detection, per-operator
  semantic checks).
- **Segment inlining** (ADR 0006) now recurses: a single-key `inSegment` is spliced
  in an **AND context** (top level / `all`), but in an **OR/NOT context** it can't be
  spliced (it would OR the segment's conditions), so it becomes an `{ all: … }` group.
  Array `inSegment` / `notInSegment` still embed + evaluate at runtime.
- **UI:** a recursive `ConditionTree` (vertical filter-builder) — "Add condition" /
  "Add group", a per-group combinator (`All` / `Any` / `None`, where **None = NOR =
  `not` of an `any`**), nested boxes with indentation. The leaf row is the existing
  `ConditionRow`.
- **Validation/OpenAPI** describe the node recursively (valibot `v.lazy` union;
  OpenAPI `$ref` self-reference).

## Consequences

- **Arbitrary boolean logic in one rule** — `plan=pro AND (seats>10 OR role=admin)
AND NOT region=test` — natively, no external engine. `matches` (engine-backed) and
  `inSegment [A,B]` remain conveniences, not the only way to OR.
- **Back-compat by construction:** flat leaf arrays are valid `ConditionNode[]`;
  existing data, tests, and the request path are unchanged when no groups are used.
- **Snapshots may now contain groups.** Single-key `inSegment` still inlines (lean),
  but rules that use groups carry them through to the compiled snapshot; the evaluator
  handles them directly.
- **`not` is exposed as "None (NOR)"** in the builder (`not` of an `any`), the common
  "none of these" case; a raw `{ not: <leaf> }` from the API still renders. Per-leaf
  negations (`notEquals`/`notIn`/`notInSegment`/`notMatches`) remain for the simple case.
- A future visual polish (drag-reorder, collapse) can build on `ConditionTree`; the
  data model won't need to change.
