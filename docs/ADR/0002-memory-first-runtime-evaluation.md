# ADR 0002 — Memory-First Runtime Evaluation

**Status:** Accepted

---

## Context

The central product promise is: "The admin/control plane can be down — and your applications keep evaluating flags."

This requires that flag resolution in the application runtime never synchronously depends on the admin panel, the database, or any external service. The alternatives were:

- **Evaluate against storage on each request** — simple but creates a hard availability dependency. Any storage hiccup causes flag evaluation to fail or time out.
- **Evaluate against a local cache with TTL** — common approach, but a cache miss still hits storage in the request path.
- **Load a whole snapshot into memory once, refresh in the background** — completely removes storage from the request path.

---

## Decision

The OpenFeature provider (`createOpenFeatureProvider`) loads the active `Snapshot` into process memory during `initialize()`. All subsequent flag resolution reads only the in-memory snapshot. Storage is touched only:

1. During `initialize()` (once at startup).
2. On a background `setInterval` timer (default every 30 s, configurable via `refreshIntervalMs`).
3. On watch change notifications (best-effort, storage-adapter-specific).

The evaluator (`evaluateFlag`) is a **zero-dependency** pure function — no I/O, no network, no external packages. It was designed this way deliberately: any import of a third-party library into the evaluator or provider would risk pulling in code that could fail or have side effects on the request path.

### Last-Known-Good Policy

A background refresh that throws does not clear the in-memory snapshot. It marks the snapshot `stale` and logs a warning. Callers can detect staleness via `flagMetadata.stale: true` in resolution results or by inspecting `provider.stale`. A later successful refresh replaces memory and clears the stale flag.

This means the application continues serving the last flag state it successfully loaded, rather than falling back to all-defaults on the first storage blip.

### `initialize()` Non-Failure Guarantee

If `initialize()` fails to load a snapshot (storage unavailable, no snapshot published yet), it does not throw. The provider becomes ready with an empty in-memory state and serves caller defaults with reason `DEFAULT` / errorCode `FLAG_NOT_FOUND`. Applications are never prevented from starting up due to a flag load failure.

### Zero Runtime Dependency on `@openfeature/server-sdk`

The provider satisfies the OpenFeature `Provider` interface structurally. It imports the SDK for **types only** (`import type`). The `StandardResolutionReasons` const and `ErrorCode` enum from the SDK are runtime objects — importing them would create a hard dependency. Their exact string values are replicated as local literals inside the provider, then coerced to the SDK's types (which are erased at compile time).

This keeps the request path dependency count at zero beyond the package itself.

---

## Consequences

- **Applications survive admin/storage outages** after the first successful load with no degradation beyond `stale` marking.
- **Evaluation is synchronous and fast** — no await, no network.
- **Snapshot granularity** — the provider loads a whole snapshot, not individual flags. This is intentional: partial snapshots could create inconsistent states across flags.
- **Propagation latency** — a flag change takes up to `refreshIntervalMs` (or one watch notification) to reach running application instances. This is acceptable for feature flags (not real-time data).
- **Memory usage** — the snapshot lives in heap. For projects with thousands of flags this is still small (JSON objects, not binary blobs).
- **The evaluator can never be extended with async operations** — a deliberate constraint that keeps the request path synchronous.
