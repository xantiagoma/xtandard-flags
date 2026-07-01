# Hooks

Control-plane extensibility. A **hook** is plain JavaScript wired in at
`createFlagsCore` / `createFetchHandler` time that runs around admin
mutations — publish, rollback, flag/segment changes. Use it to enforce policy
(deny a publish) or fire side effects (webhooks, notifications, cache purges).

> **Not** OpenFeature's own [Hooks](https://openfeature.dev/specification/sections/hooks).
> Those run **client-side, in the SDK, around a single evaluation**. These are
> **server-side, control-plane** hooks around admin mutations. Different layer,
> same word.

Hooks follow the same "tiny, feature-detected contract" pattern as
[storage](STORAGE.md) and [authorization](AUTHORIZATION.md): a small interface
you implement, passed in as an option.

---

## The two phases

```ts
import { createFetchHandler, HookDeniedError } from "@xtandard/flags";
import { createMemoryStorage } from "@xtandard/flags/storage/memory";

createFetchHandler({
  sourceStorage: createMemoryStorage(),
  hooks: {
    // Runs BEFORE a mutation commits. Throw to DENY.
    before(event) {
      if (event.type === "publish" && isFrozen()) {
        throw new HookDeniedError("Publishing is frozen until Jan 2.");
      }
    },
    // Runs AFTER a mutation commits. Side effects only.
    after(event) {
      if (event.type === "published") notifySlack(`${event.snapshot.version} shipped`);
    },
  },
});
```

| Phase    | When        | Semantics                                                                                                                                                                     |
| -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `before` | pre-commit  | Runs **sequentially, in declared order**. **Throw to deny** (nothing commits; the first throw short-circuits). This is the enforcement primitive for governance + gating.     |
| `after`  | post-commit | Side effects only. Errors are **isolated** and routed to `onHookError` — a failing side effect **never** rolls back an already-committed mutation. Runs after the op returns. |

Pass **one hook or an array**. `before` hooks run in order; `after` hooks all
run even if one throws.

```ts
createFlagsCore({ sourceStorage, hooks: [requireTicketMessage, auditToSiem, purgeCdn] });
```

### Denying: `throw`, and `HookDeniedError`

Any thrown error from `before` denies the mutation. For a clean HTTP response,
throw **`HookDeniedError`** — the API layer maps it to its `status` (default
`403`) with `code: "HOOK_DENIED"`. A plain `Error` still denies but maps to
`500`, so genuine hook bugs don't masquerade as policy rejections.

```ts
throw new HookDeniedError("2 approvals required", { status: 409 });
```

### `after` errors never fail the operation

The mutation already committed, so `after` errors are swallowed and reported via
`onHookError` (default: `console.warn`). Override it to route failures your way:

```ts
createFetchHandler({
  sourceStorage,
  hooks: myWebhook,
  onHookError: (err, event) => logger.error({ err, type: event.type }, "hook failed"),
});
```

---

## Events

`before` receives a `BeforeEvent` (the _proposed_ mutation); `after` receives an
`AfterEvent` (the _committed_ result). Both are discriminated unions keyed on
`type`. Every event carries `projectKey` + `environmentKey`.

| Mutation       | `before` type    | `after` type       | Notable payload                                           |
| -------------- | ---------------- | ------------------ | --------------------------------------------------------- |
| Upsert flag    | `flag.upsert`    | `flag.upserted`    | `flag` (input → stamped)                                  |
| Delete flag    | `flag.delete`    | `flag.deleted`     | `flagKey`                                                 |
| Archive flag   | `flag.archive`   | `flag.archived`    | `flag`                                                    |
| Restore flag   | `flag.restore`   | `flag.restored`    | `flag`                                                    |
| Upsert segment | `segment.upsert` | `segment.upserted` | `segment`                                                 |
| Delete segment | `segment.delete` | `segment.deleted`  | `segmentKey`                                              |
| Publish        | `publish`        | `published`        | `draft` (before) / `snapshot` (after), `actor`, `message` |
| Rollback       | `rollback`       | `rolledback`       | `toVersion`/`version`, `fromVersion`, `actor`             |

Hooks fire on the **admin plane only** — never on the evaluation hot path (the
memory-first, zero-dep evaluator stays pure and fast, see
[ADR 0002](ADR/0002-memory-first-runtime-evaluation.md)).

---

## Bundled adapters

Two reference hooks ship as subpath exports — use directly or as templates.

### `@xtandard/flags/hooks/webhook`

POST events to an HTTP endpoint, optionally HMAC-SHA256 signed, with retry +
backoff. Fires on `after` events. Best-effort: after `maxAttempts` it throws,
surfacing via `onHookError` without failing the mutation.

```ts
import { createWebhookHook } from "@xtandard/flags/hooks/webhook";

createFetchHandler({
  sourceStorage,
  hooks: createWebhookHook({
    url: "https://example.com/flag-events",
    secret: process.env.WEBHOOK_SECRET, // adds `x-flags-signature: sha256=<hex>`
    events: ["published", "rolledback"], // optional filter (default: all)
  }),
});
```

Options: `url`, `secret?`, `events?`, `headers?`, `signatureHeader?` (default
`x-flags-signature`), `maxAttempts?` (3), `retryDelayMs?` (200, exponential),
`timeoutMs?` (10 000), `fetch?` (injectable).

Verify the signature on your receiver by recomputing
`HMAC-SHA256(secret, rawBody)` and comparing to the header's `sha256=` value.

### `@xtandard/flags/hooks/log`

The minimal reference consumer — logs each event. Handy for local debugging.

```ts
import { createLogHook } from "@xtandard/flags/hooks/log";

createFetchHandler({ sourceStorage, hooks: createLogHook() });
// options: { log?, includeBefore?, format? }
```

### `@xtandard/flags/hooks/test-gate`

Gate publishing on **pinned flag tests**. Attach example evaluations to a flag
via its `tests` array; on publish the gate re-evaluates the draft and **denies**
(HTTP `422`) if any case regresses. Turns "did I break targeting?" into a
pre-publish check — built entirely on the pure evaluator.

```ts
import { createTestGate } from "@xtandard/flags/hooks/test-gate";

createFetchHandler({ sourceStorage, hooks: createTestGate() });
```

A flag pins its expectations (dev/CI metadata — **stripped from compiled
snapshots**, never shipped to runtimes):

```ts
{
  key: "checkout", type: "string", /* …variants, rules… */
  tests: [
    { name: "enterprise sees new flow",
      context: { targetingKey: "u1", plan: "enterprise" },
      expect: { variant: "new" } },
    { context: { targetingKey: "u2" }, expect: { value: "old" } },
  ],
}
```

On regression the publish is blocked with a message naming each failing case:

```
Publish blocked — 1 flag test(s) failed:
  - checkout "enterprise sees new flow": expected variant "new", got "old" (DEFAULT)
```

The pure checker (`runFlagTests(flags, segments)`) is exported for use in your
own CI outside the publish path.

---

## Recipes (write your own)

`before` — policy / gates (throw to deny):

```ts
// No publishing on Fridays.
before(e) {
  if (e.type === "publish" && new Date().getDay() === 5) {
    throw new HookDeniedError("No Friday publishes.");
  }
}

// Require a ticket reference in the publish message.
before(e) {
  if (e.type === "publish" && !/[A-Z]+-\d+/.test(e.message ?? "")) {
    throw new HookDeniedError("Publish message must reference a ticket (e.g. JIRA-123).", {
      status: 422,
    });
  }
}

// Enforce a flag-key naming convention.
before(e) {
  if (e.type === "flag.upsert" && !e.flag.key.startsWith(`${team}-`)) {
    throw new HookDeniedError(`Flag keys must start with "${team}-".`);
  }
}
```

`after` — side effects (best-effort):

```ts
// Purge a CDN cache when config changes.
after(e) {
  if (e.type === "published" || e.type === "rolledback") await purgeCache(e.projectKey);
}

// Mirror the audit trail to your SIEM.
after(e) {
  if (e.type === "published") await siem.record("flags.publish", e);
}
```

For distinct failure modes, prefer separate hooks — each is independent and, for
`after`, isolated from the others.

---

## API

```ts
import type { FlagsHooks, BeforeEvent, AfterEvent, HookErrorReporter } from "@xtandard/flags";
import { HookDeniedError } from "@xtandard/flags";

interface FlagsHooks {
  before?(event: BeforeEvent): void | Promise<void>; // throw to deny
  after?(event: AfterEvent): void | Promise<void>; // side effects only
}
```

Configure via `createFlagsCore({ hooks, onHookError })` or
`createFetchHandler({ hooks, onHookError })`. When you pass a prebuilt `core` to
`createFetchHandler`, configure hooks on that core instead.
