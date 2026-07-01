/**
 * Hooks demo. One server wires the admin-plane hooks + the runtime-plane
 * evaluation observer, plus a self-hosted webhook receiver, so you can watch it
 * all in the console:
 *
 *   bun run src/index.ts
 *
 * - **log** hook (admin observer)  → every mutation is logged (📝).
 * - **before** gate (policy)       → publishing requires a ticket ref (e.g. ABC-123).
 * - **webhook** hook (side effect) → publish/rollback POST a signed event to /_webhook (📨).
 * - **test-gate** (before)         → a flag's pinned tests must pass or publish is denied (422).
 * - **onEvaluation** (runtime)     → every evaluation is logged (📊), from OFREP + the
 *                                    in-process provider (see `event.source`).
 *
 * See ../README.md for the click-through and curl walkthrough.
 */
import { createFetchHandler, HookDeniedError } from "@xtandard/flags";
import type { EvaluationEvent, Flag } from "@xtandard/flags";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createMemoryStorage } from "@xtandard/flags/storage/memory";
import { createLogHook } from "@xtandard/flags/hooks/log";
import { createWebhookHook } from "@xtandard/flags/hooks/webhook";
import { createTestGate } from "@xtandard/flags/hooks/test-gate";

const port = Number(process.env.PORT) || 3000;
const WEBHOOK_SECRET = "demo-secret";
const WEBHOOK_URL = `http://localhost:${port}/_webhook`;

// Runtime-plane observer — fires once per flag *evaluation* (not a mutation).
// `e.source` is "ofrep" (remote HTTP) or "provider" (in-process, memory-first).
const logEval = (e: EvaluationEvent) =>
  console.log(`  📊 eval [${e.source}] ${e.flagKey} → ${e.variant} (${e.reason})`);

const storage = createMemoryStorage();

const panel = createFetchHandler({
  basePath: "",
  sourceStorage: storage,
  title: "Hooks demo",
  // Runtime plane: observe OFREP (remote HTTP) evaluations served by this panel.
  onEvaluation: logEval,
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
// Publish once on boot (ticket ref satisfies the message gate) so there's an
// active snapshot for the in-process provider to evaluate.
await panel.core.publish({ message: "seed FLAGS-1" });

// Runtime plane, second surface: the in-process (memory-first, resilient)
// provider reading the same runtime storage. Wire the SAME onEvaluation sink —
// events arrive with source "provider" instead of "ofrep".
const provider = createOpenFeatureProvider({
  storage,
  refreshIntervalMs: 0,
  onEvaluation: logEval,
});
await provider.initialize();
console.log("\n— demonstrating an in-process (provider) evaluation on boot —");
await provider.resolveStringEvaluation("checkout-flow", "old", { targetingKey: "vip" });

console.log(`\n▶ hooks demo on http://localhost:${port}\n`);
console.log("Seeded + published `checkout-flow` (2 pinned tests).\n");
console.log("Try it:");
console.log(
  `  1. Open http://localhost:${port} — edit + publish (message must have a ticket ref).`,
);
console.log("  2. Watch this console for 📝 mutations, 📨 webhooks, and 📊 evaluations.");
console.log(`  3. Publish without a ticket ref → denied (422). With "ABC-123" → allowed.`);
console.log("  4. Remove the `vip` override, then publish → the test-gate blocks it (422).\n");
const base = `http://localhost:${port}/api/projects/default/environments/production`;
console.log("Or via curl:");
console.log(
  `  curl -sS -X POST ${base}/publish -H 'content-type: application/json' -d '{"message":"ship ABC-123"}'`,
);
console.log("  # trigger an OFREP (source=ofrep) evaluation → prints a 📊 line:");
console.log(
  `  curl -sS -X POST http://localhost:${port}/ofrep/v1/evaluate/flags` +
    ` -H 'content-type: application/json' -d '{"context":{"targetingKey":"vip"}}'`,
);
