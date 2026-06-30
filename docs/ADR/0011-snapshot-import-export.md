# ADR 0011 — Snapshot JSON Download / Import + Public Schema

**Status:** Accepted

---

## Context

A published [snapshot](./0006-segment-resolution.md) is the immutable, compiled
configuration for a version. Operators want to **download** a version's JSON (to
diff offline, archive, or hand-edit) and **upload** a JSON as a new version — e.g.
to copy config between environments, restore from an external backup, or apply a
bulk edit made in an editor.

Two questions shaped the design:

1. **Where does an uploaded document land?** Directly as a new published version,
   or into the draft for review?
2. **Can editors validate the JSON?** `$schema` references in a JSON file let
   VS Code (and others) validate + autocomplete against a published schema.

## Decision

### Import lands in the draft, not a new version

`core.importDraft({ flags, segments? })` **replaces the draft wholesale**, then the
operator reviews via the existing draft → diff → publish path and publishes
themselves. Import does **not** mint a version directly.

This reuses everything already built — validation (`assertValidDraft` + per-segment
`validateSegment` + `validateSegmentReferences`), the unpublished-changes diff
([ADR-adjacent](./0010-scheduled-active-window.md)), and the publish flow with its
audit entry. An import that turns out wrong is just a `Discard` away; nothing
becomes a permanent version without an explicit publish. The UI routes to Flags on
success with a "review then publish" toast.

Invalid input throws `DraftValidationError` → HTTP **422 VALIDATION**; nothing is
written. Extra top-level fields (`$schema`, `version`, `schemaVersion`, `createdAt`,
…) are **ignored**, so a downloaded snapshot re-imports unchanged.

### Download embeds a `$schema` reference

"Download JSON" serializes the snapshot with `"$schema": "<absolute schema URL>"`
prepended (`snapshot-vN.json`). The URL is resolved against the panel's mount point
(`apiBase` / `<base href>`), so it works for both the bundled SPA and the embedded
`@xtandard/flags/react` component.

### Public JSON Schema at `GET /api/schema.json`

`buildImportSchema()` produces a self-contained **JSON Schema 2020-12** document by
reusing the OpenAPI component `schemas` (the single source of truth for the data
shapes) as `$defs`, rewriting `#/components/schemas/` refs → `#/$defs/`. The
envelope requires `flags`, allows `segments?`, and permits snapshot metadata fields
with `additionalProperties: true` so a downloaded snapshot validates as-is.

The route is **unauthenticated** and sets `access-control-allow-origin: *` — editors
fetch the schema cross-origin from a `$schema` URL, and the schema describes only
the (public) shape of the config, never any data.

## Consequences

- **One write path.** Import funnels through `putDraft` + the segments store, the
  same as the admin API; no parallel "import a version" code path or its own audit
  semantics. Publish remains the only thing that creates a version.
- **Round-trip is functional, not byte-exact.** Published snapshots inline
  `inSegment` segments into flags and embed only `notInSegment` segments separately
  ([ADR 0006](./0006-segment-resolution.md)). Re-importing a snapshot yields a draft
  that _evaluates identically_ but does not reconstruct every original named segment.
  Acceptable: the snapshot is the compiled runtime form, and the evaluator behavior
  is what matters.
- **Schema stays in sync for free.** Because the schema is derived from the OpenAPI
  `schemas` object, adding a flag/segment field updates both the API docs and the
  import schema from one edit — no separately-maintained schema to drift.
- **Lenient empty import.** A document with no `flags` map is treated as an empty
  config (clears the draft) at the API layer; the UI guards against this footgun by
  rejecting a missing `flags` map client-side before calling the endpoint.
