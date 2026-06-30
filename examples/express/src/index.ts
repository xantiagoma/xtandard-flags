/**
 * Express + @xtandard/flags — admin panel AND a flag-driven demo page.
 *
 *   bun add express @xtandard/flags @openfeature/server-sdk
 *   bun run src/index.ts
 *
 * Then:
 *   - GET /        → an HTML page whose content is driven by three flags.
 *   - GET /flags   → the embedded admin panel. Edit a flag, Publish, refresh /.
 *
 * Mount the panel BEFORE any body-parsing middleware — it reads the raw body.
 *
 * The panel publishes to `runtimeStorage`; the OpenFeature provider reads from
 * the SAME dir and refreshes every 2s, so published changes show up on the next
 * page load without restarting the server.
 */
import express from "express";
import { OpenFeature } from "@openfeature/server-sdk";
import { flagsPanel } from "@xtandard/flags/express";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createFileStorage } from "@xtandard/flags/storage/file";
import { renderDemoPage, seedIfEmpty } from "./demo.ts";

// Source = canonical drafts/history; runtime = the published snapshots apps read.
const sourceStorage = createFileStorage({ dir: "./.flags/source" });
const runtimeStorage = createFileStorage({ dir: "./.flags/runtime" });

// Seed once on boot so the demo page shows flag-driven output on first run.
await seedIfEmpty({ sourceStorage, runtimeStorage });

// Memory-first runtime provider over the published snapshots; refreshes every 2s.
const provider = createOpenFeatureProvider({
  storage: runtimeStorage,
  refreshIntervalMs: 2000,
});
await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient();

const app = express();

// Panel first (raw body), then your own parsers/routes.
app.use(
  "/flags",
  flagsPanel({
    basePath: "/flags",
    title: "Acme Flags",
    sourceStorage,
    runtimeStorage,
  }),
);

app.get("/", async (_req, res) => {
  const ctx = { targetingKey: "demo-user", country: "FR", plan: "beta" };
  const [newGreeting, bannerColor, maxItems] = await Promise.all([
    client.getBooleanValue("new-greeting", false, ctx),
    client.getStringValue("banner-color", "#2563eb", ctx),
    client.getNumberValue("max-items", 3, ctx),
  ]);
  res.type("html").send(renderDemoPage({ newGreeting, bannerColor, maxItems }));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () =>
  console.log(`Express on http://localhost:${port} (demo at /, panel at /flags)`),
);
