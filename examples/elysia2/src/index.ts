/**
 * Elysia 2 + @xtandard/flags — typed admin plugin AND per-request flag context.
 *
 *   bun add elysia@rc @xtandard/flags @openfeature/server-sdk
 *   bun run src/index.ts
 *
 * Then:
 *   - GET /             → an HTML page whose content is driven by three flags.
 *   - GET /?user=alice  → same page for `alice`, who has an override on `new-greeting`.
 *   - GET /flags        → the admin panel. Edit a flag, Publish, refresh /.
 *
 * Two Elysia 2 specifics:
 *   - `flagsElysia` from `@xtandard/flags/elysia2` declares the admin routes, so
 *     `@elysia/eden`'s treaty can call them typed (`/elysia` is for Elysia 1.x).
 *   - `.wrap()` runs every request inside OpenFeature's transaction context
 *     (AsyncLocalStorage), so handlers evaluate flags without threading a context
 *     object through every call.
 */
import { Elysia } from "elysia";
import {
  AsyncLocalStorageTransactionContextPropagator,
  OpenFeature,
} from "@openfeature/server-sdk";
import { flagsElysia } from "@xtandard/flags/elysia2";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createFileStorage } from "@xtandard/flags/storage/file";
import { renderDemoPage, seedIfEmpty } from "./demo.ts";

const port = Number(process.env.PORT) || 3000;

// Source = canonical drafts/history; runtime = the published snapshots apps read.
const sourceStorage = createFileStorage({ dir: "./.flags/source" });
const runtimeStorage = createFileStorage({ dir: "./.flags/runtime" });

await seedIfEmpty({ sourceStorage, runtimeStorage });

const provider = createOpenFeatureProvider({
  storage: runtimeStorage,
  refreshIntervalMs: 2000,
});
await OpenFeature.setProviderAndWait(provider);
OpenFeature.setTransactionContextPropagator(new AsyncLocalStorageTransactionContextPropagator());
const client = OpenFeature.getClient();

const app = new Elysia()
  // Per-request evaluation context: who is asking. Everything downstream of
  // fetch(request) — handlers, services, mounted apps — sees it.
  // setTransactionContext returns void, so capture the response via a Promise.
  .wrap(
    (fetch) => (request) =>
      new Promise<Response>((resolve, reject) =>
        OpenFeature.setTransactionContext(
          { targetingKey: new URL(request.url).searchParams.get("user") ?? "anonymous" },
          () => Promise.resolve(fetch(request)).then(resolve, reject),
        ),
      ),
  )
  .get("/", async () => {
    // No context argument: the transaction context supplies `targetingKey`.
    const [newGreeting, bannerColor, maxItems] = await Promise.all([
      client.getBooleanValue("new-greeting", false),
      client.getStringValue("banner-color", "#2563eb"),
      client.getNumberValue("max-items", 3),
    ]);
    return new Response(renderDemoPage({ newGreeting, bannerColor, maxItems }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  })
  .use(flagsElysia({ prefix: "/flags", title: "Acme Flags", sourceStorage, runtimeStorage }))
  .listen(port);

// For a typed client: `treaty<typeof app>("localhost:3000").flags!.api.projects.get()`.
export type App = typeof app;

console.log(`Elysia 2 listening on http://localhost:${port} (demo at /, panel at /flags)`);
