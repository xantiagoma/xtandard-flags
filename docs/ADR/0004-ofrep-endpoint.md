# ADR 0004 — OFREP Endpoint (Remote Evaluation)

**Status:** Accepted

---

## Context

[ADR 0002](./0002-memory-first-runtime-evaluation.md) establishes the product's central promise: applications evaluate flags from an in-process memory snapshot, so the admin/control plane and storage can be down without affecting the request path. The recommended integration is the in-process OpenFeature provider (`createOpenFeatureProvider`).

Not every consumer can evaluate in-process, though:

- **Browser / mobile / client-side SDKs** cannot hold the whole snapshot or the storage credentials.
- **Edge / serverless functions** with tiny bundles may not want to embed the evaluator.
- **Polyglot stacks** (Go, Python, Rust) want a language-agnostic way to resolve flags without re-implementing the evaluator.

OpenFeature defines a standard for exactly this: the **OpenFeature Remote Evaluation Protocol (OFREP)** — a small HTTP contract (`POST /ofrep/v1/evaluate/flags` and `/ofrep/v1/evaluate/flags/{key}`) that any OFREP-compatible SDK can call.

---

## Decision

The control-plane handler serves OFREP:

- `POST /ofrep/v1/evaluate/flags` — bulk: evaluate every flag for a context, returning `{ flags: [{ key, value, variant, reason, metadata }] }`.
- `POST /ofrep/v1/evaluate/flags/{key}` — single: returns one OFREP evaluation, or `404` with `errorCode: "FLAG_NOT_FOUND"`.

Both reuse `core.evaluate({ source: "active" })` — i.e. they resolve against the **published snapshot**, never the draft — so archived and draft-only flags never leak. The OFREP path carries no project/environment, so they default to the handler's configured pair, overridable with `?projectKey=&environmentKey=`. Requests go through the same authentication and `flag:read` authorization as the rest of the admin API; for an edge-facing deployment use the `none` or a delegated auth/authorization provider.

Reasons are mapped to OpenFeature strings (`toOpenFeatureReason`); `PREREQUISITE_FAILED` is surfaced verbatim.

---

## The caveat (and why it's still worth doing)

Serving evaluation **from the control plane** partly conflicts with ADR 0002's "admin is never in the request path" promise: an app that calls OFREP on every flag check has reintroduced a synchronous dependency on the control plane, exactly what the in-process provider avoids.

We accept this **as an opt-in convenience, not the recommended path**:

- The in-process `createOpenFeatureProvider` remains the recommended integration for any server that can run it, and keeps its zero-request-path-dependency guarantee.
- OFREP is for consumers that genuinely cannot evaluate in-process (browsers, edge, other languages). Those clients should cache OFREP responses and degrade to last-known-good / caller defaults on failure — the same posture the in-process provider takes internally.
- OFREP is purely additive: it changes nothing about the snapshot model, the evaluator, or the provider.

---

## Consequences

- **Language/platform-agnostic evaluation** is available without embedding the evaluator.
- **Consistent semantics** — OFREP, the in-process provider, and the admin "test targeting" all run the _same_ `evaluateFlag`, so results match.
- **A new (opt-in) request-path dependency** exists for OFREP consumers; documented above, and gated behind the same auth as the admin API.
- **No streaming yet** — OFREP's optional `GET /ofrep/v1/stream` (SSE refetch hints) is intentionally out of scope for now; it maps cleanly onto the existing publish/watch event if added later.
