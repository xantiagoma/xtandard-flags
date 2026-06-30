/**
 * Elysia + @xtandard/flags — admin panel AND a flag-driven demo page.
 *
 *   bun add elysia @xtandard/flags @openfeature/server-sdk
 *   bun run src/index.ts
 *
 * Then:
 *   - GET /        → an HTML page whose content is driven by three flags.
 *   - GET /flags   → the embedded admin panel. Edit a flag, Publish, refresh /.
 *
 * The panel publishes to `runtimeStorage`; the OpenFeature provider reads from
 * the SAME dir and refreshes every 2s, so published changes show up on the next
 * page load without restarting the server.
 */
import { Elysia } from "elysia";
import { OpenFeature } from "@openfeature/server-sdk";
import { flagsPanel } from "@xtandard/flags/elysia";
import { createFlagsCore } from "@xtandard/flags";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createFileStorage } from "@xtandard/flags/storage/file";
import { renderDemoPage, seedIfEmpty } from "./demo.ts";

const port = Number(process.env.PORT) || 3000;

// Source = canonical drafts/history; runtime = the published snapshots apps read.
// The provider below reads the SAME runtime dir the panel publishes to.
const sourceStorage = createFileStorage({ dir: "./.flags/source" });
const runtimeStorage = createFileStorage({ dir: "./.flags/runtime" });

// Seed once on boot so the demo page shows flag-driven output on first run.
await seedIfEmpty({ sourceStorage, runtimeStorage });

// Memory-first runtime provider over the published snapshots. refreshIntervalMs
// keeps it in sync with the panel within ~2s of a Publish.
const provider = createOpenFeatureProvider({
  storage: runtimeStorage,
  refreshIntervalMs: 2000,
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
      title: "Acme Flags",
      sourceStorage,
      runtimeStorage,
    }),
  )
  .listen(port);

console.log(`Elysia listening on http://localhost:${port} (demo at /, panel at /flags)`);
