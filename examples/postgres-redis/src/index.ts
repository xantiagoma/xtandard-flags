/**
 * The marquee PRODUCTION combo: **Postgres as source**, **Redis as runtime**.
 *
 *   docker compose up -d          # start postgres + redis
 *   bun install
 *   bun run start                 # honors PORT; defaults to 3000
 *
 * Then:
 *   - GET /        → an HTML page whose content is driven by three flags.
 *   - GET /flags   → the embedded admin panel. Edit a flag, Publish, refresh /.
 *
 * ## Why two backends? The "split planes" pattern.
 *
 *   sourceStorage  = Postgres — durable, transactional. Holds the canonical
 *                    drafts, snapshot history, and audit log. This is your system
 *                    of record; it can be backed up, queried, and survives forever.
 *
 *   runtimeStorage = Redis — fast, in-memory, and *watchable*. Holds only the
 *                    published snapshots apps read. The OpenFeature provider
 *                    subscribes to Redis keyspace notifications, so a Publish in
 *                    the panel propagates to every running app within
 *                    milliseconds — no polling lag, no Postgres on the hot path.
 *
 * `publish()` writes the compiled snapshot to BOTH planes. Apps only ever read
 * the Redis runtime plane; Postgres (and the admin panel) can be down and apps
 * keep serving last-known-good values from memory.
 */
import { Elysia } from "elysia";
import { OpenFeature } from "@openfeature/server-sdk";
import { flagsPanel } from "@xtandard/flags/elysia";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createPostgresStorage } from "@xtandard/flags/storage/postgres";
import { createRedisStorage } from "@xtandard/flags/storage/redis";
import { renderDemoPage, seedIfEmpty } from "./demo.ts";

const port = Number(process.env.PORT) || 3000;
const databaseUrl = process.env.DATABASE_URL ?? "postgres://flags:flags@localhost:5432/flags";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// Source = canonical drafts/history/audit in Postgres (durable, transactional).
const sourceStorage = createPostgresStorage({ connectionString: databaseUrl });
// Runtime = published snapshots in Redis (fast, watch-based refresh). The prefix
// namespaces keys so several deployments can share one Redis instance.
const runtimeStorage = createRedisStorage({ url: redisUrl, prefix: "xtandard:flags:runtime" });

// Seed once on boot so the demo page shows flag-driven output on first run. This
// publishes through the core, writing to BOTH Postgres (source) and Redis (runtime).
await seedIfEmpty({ sourceStorage, runtimeStorage });

// Memory-first runtime provider over the Redis snapshots. Because Redis is
// watchable (keyspace notifications), publishes propagate via `watch`; the short
// refresh interval is just a backstop.
const provider = createOpenFeatureProvider({
  storage: runtimeStorage,
  refreshIntervalMs: 5000,
});
await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient();

new Elysia()
  .get("/", async () => {
    const ctx = { targetingKey: "demo-user", country: "FR", plan: "beta" };
    const [newGreeting, bannerColor, maxItems] = await Promise.all([
      client.getBooleanValue("new-greeting", false, ctx),
      client.getStringValue("banner-color", "#2563eb", ctx),
      client.getNumberValue("max-items", 3, ctx),
    ]);
    return new Response(renderDemoPage({ newGreeting, bannerColor, maxItems }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  })
  .mount(
    "/flags",
    flagsPanel({
      basePath: "/flags",
      title: "Acme Flags (Postgres + Redis)",
      sourceStorage,
      runtimeStorage,
    }),
  )
  .listen(port);

console.log(`Listening on http://localhost:${port} (demo at /, panel at /flags)`);
console.log(`  source  → Postgres ${databaseUrl}`);
console.log(`  runtime → Redis    ${redisUrl}`);
