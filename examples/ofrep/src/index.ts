/**
 * OFREP (OpenFeature Remote Evaluation Protocol) — end-to-end demo.
 *
 *   bun add @xtandard/flags
 *   bun run src/index.ts
 *
 * Boots a @xtandard/flags panel (with the opt-in SSE stream enabled), seeds and
 * publishes a couple of flags, then acts as an **OFREP client over plain HTTP** —
 * no vendor SDK, which is the whole point: any language with an HTTP client (or
 * the generic OpenFeature OFREP provider) can evaluate flags this way.
 *
 * It demonstrates the three OFREP compliance features:
 *   1. Bulk + single evaluation (with flag `metadata`: snapshot version + type).
 *   2. ETag / 304 caching — an unchanged re-poll returns 304 with no body.
 *   3. SSE streaming — a `configuration_changed` event fires on publish.
 *
 * In a real deployment the panel runs separately (Docker / `npx @xtandard/flags
 * serve`) and your apps point their OpenFeature OFREP provider at its URL. Here
 * everything is in one process so the example is self-contained and runnable.
 */
import { createFetchHandler } from "@xtandard/flags";
import { createMemoryStorage } from "@xtandard/flags/storage/memory";

// --- 1. Stand up the panel (streaming on) and seed an active snapshot. ---
const panel = createFetchHandler({
  sourceStorage: createMemoryStorage(),
  runtimeStorage: createMemoryStorage(),
  streaming: true, // enables GET /ofrep/v1/stream + eventStreams advertisement
});

await panel.core.upsertFlag({
  key: "new-checkout",
  type: "boolean",
  enabled: true,
  defaultVariant: "off",
  variants: { on: { value: true }, off: { value: false } },
  rules: [
    {
      id: "beta-users",
      conditions: [{ attribute: "plan", operator: "equals", value: "beta" }],
      serve: { variant: "on" },
    },
  ],
  fallthrough: { variant: "off" },
});
await panel.core.upsertFlag({
  key: "banner-color",
  type: "string",
  enabled: true,
  defaultVariant: "blue",
  variants: { blue: { value: "#2563eb" }, green: { value: "#16a34a" } },
  fallthrough: { variant: "blue" },
});
await panel.core.publish({ message: "seed" });

const server = Bun.serve({ port: Number(process.env.PORT) || 0, fetch: panel.fetch });
const base = `http://localhost:${server.port}`;
console.log(`▶ panel + OFREP listening on ${base}\n`);

// The evaluation context — same shape any OpenFeature SDK would send.
const context = { targetingKey: "user-42", plan: "beta" };

/** POST helper for the OFREP endpoints. */
const ofrep = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/ofrep/v1/evaluate/flags${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ context }),
  });

// --- 2. Bulk evaluation. ---
console.log("① Bulk evaluate (POST /ofrep/v1/evaluate/flags)");
const bulk = await ofrep("");
const etag = bulk.headers.get("etag")!;
const bulkBody = (await bulk.json()) as {
  flags: { key: string; value: unknown; reason?: string; metadata: Record<string, unknown> }[];
  eventStreams?: { url: string }[];
};
for (const f of bulkBody.flags) {
  console.log(
    `   ${f.key} = ${JSON.stringify(f.value)}  [${f.reason}]  metadata=${JSON.stringify(f.metadata)}`,
  );
}
console.log(`   ETag: ${etag}`);
console.log(`   eventStreams: ${JSON.stringify(bulkBody.eventStreams)}\n`);

// --- 3. ETag / 304: re-poll with If-None-Match → 304, no body. ---
console.log("② Re-poll with If-None-Match (caching)");
const cached = await ofrep("", { "if-none-match": etag });
console.log(
  `   → HTTP ${cached.status} ${cached.status === 304 ? "Not Modified (served from client cache)" : ""}\n`,
);

// --- 4. Single evaluation. ---
console.log("③ Single evaluate (POST /ofrep/v1/evaluate/flags/banner-color)");
const single = (await (await ofrep("/banner-color")).json()) as {
  key: string;
  value: unknown;
  metadata: Record<string, unknown>;
};
console.log(
  `   ${single.key} = ${JSON.stringify(single.value)}  metadata=${JSON.stringify(single.metadata)}\n`,
);

// --- 5. SSE: subscribe, publish a change, observe the live event. ---
console.log("④ Subscribe to SSE (GET /ofrep/v1/stream), then publish a change…");
const sse = await fetch(`${base}/ofrep/v1/stream`);
const reader = sse.body!.getReader();
const decoder = new TextDecoder();

// Read the stream in the background; resolve when a config-change event arrives.
const changed = (async () => {
  let buffer = "";
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes("configuration_changed")) {
      const line = buffer.split("\n").find((l) => l.startsWith("data:")) ?? "";
      return line.replace(/^data:\s*/, "");
    }
  }
  return null;
})();

// Flip banner-color's default to green and publish → bumps the active version.
await panel.core.upsertFlag({
  key: "banner-color",
  type: "string",
  enabled: true,
  defaultVariant: "green",
  variants: { blue: { value: "#2563eb" }, green: { value: "#16a34a" } },
  fallthrough: { variant: "green" },
});
await panel.core.publish({ message: "switch banner to green" });

const event = await changed;
console.log(`   ← SSE event: configuration_changed ${event ?? "(timed out)"}`);

// Re-fetch shows the new value (and a fresh ETag).
const after = await ofrep("/banner-color");
const afterBody = (await after.json()) as { value: unknown; metadata: Record<string, unknown> };
console.log(`   re-fetch banner-color = ${JSON.stringify(afterBody.value)} (was #2563eb)\n`);

console.log("✓ Done — OFREP bulk/single, ETag/304 caching, and live SSE all working.");
await reader.cancel();
server.stop();
