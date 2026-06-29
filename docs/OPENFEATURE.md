# OpenFeature Provider

The OpenFeature provider is the component your applications use to evaluate flags. It is memory-first, zero-dependency (relative to the SDK), and designed so that flag evaluation never touches storage.

---

## Install

```bash
bun add @xtandard/flags @openfeature/server-sdk
# Plus the storage adapter you want the provider to read from:
bun add redis
```

---

## Quick Start

```ts
import { OpenFeature } from "@openfeature/server-sdk";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

const provider = createOpenFeatureProvider({
  projectKey: "default",
  environmentKey: "production",
  storage: createRedisStorage({
    url: process.env.REDIS_URL!,
    prefix: "myapp:flags:runtime",
  }),
  refreshIntervalMs: 10_000,
});

await OpenFeature.setProviderAndWait(provider);

const client = OpenFeature.getClient();
```

---

## Provider Options

```ts
interface OpenFeatureProviderOptions {
  storage: FlagsStorage;
  projectKey?: string; // default: "default"
  environmentKey?: string; // default: "production"
  refreshIntervalMs?: number; // default: 30_000  (set ≤ 0 to disable polling)
  logger?: ProviderLogger; // optional warn/error logger
}
```

| Option              | Default        | Description                                                         |
| ------------------- | -------------- | ------------------------------------------------------------------- |
| `storage`           | required       | The `FlagsStorage` instance holding published snapshots.            |
| `projectKey`        | `"default"`    | Project to evaluate.                                                |
| `environmentKey`    | `"production"` | Environment to evaluate.                                            |
| `refreshIntervalMs` | `30_000`       | Background refresh interval in ms. Set to `≤ 0` to disable polling. |
| `logger`            | —              | Optional `{ warn, error }` logger for non-fatal load failures.      |

---

## The Four Typed Resolve Methods

`createOpenFeatureProvider` returns an object that implements OpenFeature's `Provider` interface. Use it through the standard `Client` API:

```ts
// Boolean
const enabled = await client.getBooleanValue("my-feature", false, {
  targetingKey: user.id,
});

// String
const variant = await client.getStringValue("theme", "light", {
  targetingKey: user.id,
  plan: user.plan,
});

// Number
const limit = await client.getNumberValue("rate-limit", 100, {
  targetingKey: user.id,
  tier: user.tier,
});

// Object (JSON)
const config = await client.getObjectValue(
  "pricing-config",
  {},
  {
    targetingKey: user.id,
  },
);
```

Each method:

1. Checks that a snapshot is loaded (returns caller default + `FLAG_NOT_FOUND` if not).
2. Looks up the flag key in the snapshot.
3. Checks that the flag's `type` matches the resolve method (`boolean` / `string` / `number` / `json`). Returns `TYPE_MISMATCH` on mismatch.
4. Calls the in-memory evaluator.
5. Returns `OFResolutionDetails<T>`.

All four methods are `async` but return immediately from memory — no I/O.

---

## Reason and Error Code Mapping

| Internal `EvaluationReason` | OpenFeature `reason` string | `errorCode`      |
| --------------------------- | --------------------------- | ---------------- |
| `STATIC`                    | `"STATIC"`                  | —                |
| `DEFAULT`                   | `"DEFAULT"`                 | —                |
| `TARGETING_MATCH`           | `"TARGETING_MATCH"`         | —                |
| `SPLIT`                     | `"SPLIT"`                   | —                |
| `DISABLED`                  | `"DISABLED"`                | —                |
| `CACHED`                    | `"CACHED"`                  | —                |
| `STALE`                     | `"STALE"`                   | —                |
| `FLAG_NOT_FOUND`            | `"ERROR"`                   | `FLAG_NOT_FOUND` |
| `ERROR`                     | `"ERROR"`                   | `GENERAL`        |

**Special cases:**

- No snapshot loaded → reason `DEFAULT`, errorCode `FLAG_NOT_FOUND`.
- Flag absent from snapshot → reason `ERROR`, errorCode `FLAG_NOT_FOUND`.
- Type mismatch → reason `ERROR`, errorCode `TYPE_MISMATCH`.
- Split with no bucketing key in context → degrades to default variant, reason `DEFAULT`, errorCode `TARGETING_KEY_MISSING` (informational, not a hard error).
- When the snapshot is stale (storage failing since last good load), `flagMetadata.stale: true` is set on every resolution result.

---

## Memory-First and Refresh Semantics

### Initialization

`initialize()` performs a single synchronous load from storage. If the load fails or returns no snapshot, the provider still constructs successfully and serves caller defaults until the next successful refresh. The application is never prevented from starting.

### Background Refresh

A `setInterval` timer fires every `refreshIntervalMs` milliseconds and calls `refresh()`. The timer is unreffed (does not keep the Node/Bun process alive).

If the storage adapter is `WatchableFlagsStorage` (e.g., Redis or memory), the provider also subscribes to change notifications:

- Watches the `snapshots/` prefix for the project/environment.
- Watches the `active_version` key.

On a publish or rollback, the watch callback triggers an immediate `refresh()`, so the provider picks up the new snapshot faster than the polling interval allows.

### Coalesced Refreshes

If a watch fires twice in quick succession (e.g., a publish writes the snapshot body then the active-version pointer, generating two events), the provider coalesces them into at most two runs: one in-flight and one pending. The second run starts after the first settles, ensuring the latest storage state is always picked up.

### Last-Known-Good

A background refresh that throws keeps the last in-memory snapshot and marks it `stale: true`. A later successful refresh replaces memory and clears `stale`. **The in-memory snapshot is never cleared on failure** — only replaced on success.

### Shutdown

```ts
await OpenFeature.close(); // calls provider.onClose()
```

`onClose` stops the refresh timer and calls the watch unsubscribe function. Safe to call multiple times.

---

## Failure Modes

| Scenario                          | Behaviour                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Admin panel is down               | No effect — provider reads from memory only.                                                                    |
| Storage down before first load    | `initialize` logs a warning; provider serves caller defaults with reason `DEFAULT`, errorCode `FLAG_NOT_FOUND`. |
| Storage down after first load     | Snapshot is marked `stale`; last-known-good values served with `flagMetadata.stale: true`.                      |
| No snapshot published yet         | Same as storage-down-before-first-load scenario.                                                                |
| Flag not in snapshot              | reason `ERROR`, errorCode `FLAG_NOT_FOUND`; caller default returned.                                            |
| Wrong type for resolve method     | reason `ERROR`, errorCode `TYPE_MISMATCH`; caller default returned.                                             |
| Bad flag config (variant missing) | reason `ERROR`, errorCode `GENERAL`; caller default returned.                                                   |

---

## Zero Runtime Dependency on the SDK

`@openfeature/server-sdk` is an optional peer dependency. The provider imports it for **types only** (`import type`). The OpenFeature `StandardResolutionReasons` object and `ErrorCode` enum are runtime values — importing them would create a hard dependency. Instead, the provider replicates the exact string values as local literals. The returned object structurally satisfies the `Provider` interface without the SDK being installed at runtime.

This means:

- Your app bundles are not affected if you evaluate flags in a context that does not have the SDK installed.
- You must install `@openfeature/server-sdk` yourself if you want to call `OpenFeature.setProvider(...)` — the provider itself does not depend on it.

---

## Extra Surface on `XtandardOpenFeatureProvider`

```ts
const provider = createOpenFeatureProvider({ storage });

// Force an immediate reload (e.g. after a CI publish step in tests):
await provider.refresh();

// Inspect freshness:
console.log(provider.lastUpdatedAt); // ISO timestamp or null
console.log(provider.stale); // boolean
```
