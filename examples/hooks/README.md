# Hooks — policy + side effects around admin mutations

[Hooks](../../docs/HOOKS.md) are plain JS wired into the panel that run around
admin mutations. This example mounts one panel with all four flavors and a
self-hosted webhook receiver so you can watch everything happen in the console.

```bash
bun install
bun run start
# or from the repo root:  bun run examples:hooks
```

| Hook                 | Phase    | What it does here                                                      |
| -------------------- | -------- | ---------------------------------------------------------------------- |
| `createLogHook`      | `after`  | logs every mutation (`📝`) to the console                              |
| publish-message gate | `before` | denies publish unless the message references a ticket (e.g. `ABC-123`) |
| `createWebhookHook`  | `after`  | POSTs a **signed** event to `/_webhook` on publish/rollback (`📨`)     |
| `createTestGate`     | `before` | denies publish if a flag's **pinned tests** regress (HTTP `422`)       |

On boot it seeds a `checkout-flow` flag with two pinned tests
(`vip → new`, everyone else → `old`) so publishing works out of the box.

## Click-through (UI)

1. Open the printed URL, edit the flag, and **Publish**.
2. Watch the console for `📝` mutation logs and, on publish, a `📨` webhook
   delivery with a valid signature.
3. Publish with a message lacking a ticket ref → **denied**. Add `ABC-123` → allowed.
4. Remove the `vip` override, then publish → the **test-gate blocks it** because
   `vip → new` no longer holds.

## Or via curl

```bash
BASE=http://localhost:3000/api/projects/default/environments/production

# before-gate: no ticket ref → 422
curl -sS -X POST $BASE/publish -H 'content-type: application/json' -d '{"message":"quick fix"}'

# with a ticket ref → published (watch the console for the 📨 webhook)
curl -sS -X POST $BASE/publish -H 'content-type: application/json' -d '{"message":"ship ABC-123"}'

# break the pinned test, then publish → test-gate denies with a per-case reason
curl -sS -X PUT $BASE/flags/checkout-flow -H 'content-type: application/json' \
  -d '{"key":"checkout-flow","type":"string","enabled":true,"defaultVariant":"old",
       "variants":{"old":{"value":"old"},"new":{"value":"new"}},"fallthrough":{"variant":"old"},
       "tests":[{"name":"vip sees the new flow","context":{"targetingKey":"vip"},"expect":{"variant":"new"}}]}'
curl -sS -X POST $BASE/publish -H 'content-type: application/json' -d '{"message":"ship ABC-124"}'
```

The webhook receiver ([`src/index.ts`](./src/index.ts)) recomputes the
HMAC-SHA256 over the raw body and compares it to the `x-flags-signature` header —
the same check your real endpoint would do.
