/**
 * Control-plane hooks demo. One server wires all four hook flavors, plus a
 * self-hosted webhook receiver so you can watch deliveries in the console:
 *
 *   bun run src/index.ts
 *
 * - **log** hook (observer)      → every mutation is logged to the console.
 * - **before** gate (policy)     → publishing requires a ticket ref (e.g. ABC-123).
 * - **webhook** hook (side effect)→ publish/rollback POST a signed event to /_webhook.
 * - **test-gate** (before)        → a flag's pinned tests must pass or publish is denied (422).
 *
 * See ../README.md for the click-through and curl walkthrough.
 */
import { createFetchHandler, HookDeniedError } from "@xtandard/flags";
import type { Flag } from "@xtandard/flags";
import { createMemoryStorage } from "@xtandard/flags/storage/memory";
import { createLogHook } from "@xtandard/flags/hooks/log";
import { createWebhookHook } from "@xtandard/flags/hooks/webhook";
import { createTestGate } from "@xtandard/flags/hooks/test-gate";

const port = Number(process.env.PORT) || 3000;
const WEBHOOK_SECRET = "demo-secret";
const WEBHOOK_URL = `http://localhost:${port}/_webhook`;

const panel = createFetchHandler({
  basePath: "",
  sourceStorage: createMemoryStorage(),
  title: "Hooks demo",
  hooks: [
    // 1. Observer — log every admin mutation.
    createLogHook({ log: (l) => console.log(`  📝 ${l.replace("[@xtandard/flags] ", "")}`) }),

    // 2. Policy gate — publish messages must reference a ticket (e.g. JIRA-123).
    {
      before(e) {
        if (e.type === "publish" && !/[A-Z]+-\d+/.test(e.message ?? "")) {
          throw new HookDeniedError("Publish message must reference a ticket, e.g. ABC-123.", {
            status: 422,
          });
        }
      },
    },

    // 3. Side effect — signed webhook on publish/rollback (delivered to /_webhook below).
    createWebhookHook({
      url: WEBHOOK_URL,
      secret: WEBHOOK_SECRET,
      events: ["published", "rolledback"],
    }),

    // 4. Publish gate — a flag's pinned tests must pass.
    createTestGate(),
  ],
  onHookError: (err, event) => console.warn(`  ⚠︎  after-hook (${event.type}) failed:`, err),
});

/** Recompute the HMAC-SHA256 of a body and compare to the `sha256=<hex>` header. */
async function verify(signature: string | null, body: string): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = [...new Uint8Array(raw)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signature === `sha256=${hex}`;
}

// Wrap the panel: intercept the demo webhook receiver, delegate everything else.
Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/_webhook" && req.method === "POST") {
      const body = await req.text();
      const ok = await verify(req.headers.get("x-flags-signature"), body);
      const event = JSON.parse(body);
      console.log(
        `  📨 webhook received: ${event.type} (signature ${ok ? "✓ valid" : "✗ INVALID"})`,
      );
      return new Response(null, { status: 204 });
    }
    return panel.fetch(req);
  },
});

// Seed a flag with a passing pinned test so publishing works out of the box.
const seed: Flag = {
  key: "checkout-flow",
  type: "string",
  enabled: true,
  defaultVariant: "old",
  variants: { old: { value: "old" }, new: { value: "new" } },
  overrides: [{ targetingKey: "vip", variant: "new" }],
  fallthrough: { variant: "old" },
  tests: [
    { name: "vip sees the new flow", context: { targetingKey: "vip" }, expect: { variant: "new" } },
    {
      name: "everyone else sees old",
      context: { targetingKey: "joe" },
      expect: { variant: "old" },
    },
  ],
};
await panel.core.upsertFlag(seed);

console.log(`▶ hooks demo on http://localhost:${port}\n`);
console.log("Seeded flag `checkout-flow` with 2 pinned tests.\n");
console.log("Try it:");
console.log(
  `  1. Open http://localhost:${port} — edit + publish (message must have a ticket ref).`,
);
console.log("  2. Watch this console for 📝 mutation logs and 📨 webhook deliveries.");
console.log(`  3. Publish without a ticket ref → denied (422). With "ABC-123" → allowed.`);
console.log("  4. Remove the `vip` override, then publish → the test-gate blocks it (422).\n");
const base = `http://localhost:${port}/api/projects/default/environments/production`;
console.log("Or via curl:");
console.log(
  `  curl -sS -X POST ${base}/publish -H 'content-type: application/json' -d '{"message":"no ticket"}'`,
);
console.log(
  `  curl -sS -X POST ${base}/publish -H 'content-type: application/json' -d '{"message":"ship ABC-123"}'`,
);
