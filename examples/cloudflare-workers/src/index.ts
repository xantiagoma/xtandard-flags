/**
 * `@xtandard/flags` ON THE EDGE — admin API + flag evaluation in a Cloudflare
 * Worker, backed entirely by Workers KV. No origin server, no database.
 *
 *   wrangler dev          # Miniflare simulates KV locally — no CF account needed
 *   wrangler deploy       # ship to the edge
 *
 * Routes:
 *   GET  /            → a flag-driven HTML page (evaluated via the OpenFeature
 *                       provider over the FLAGS_RUNTIME KV namespace).
 *   *    /flags/...   → the admin JSON API (auth, CRUD, publish, OFREP, OpenAPI).
 *
 * ## Two KV namespaces = split planes (see examples/postgres-redis for the idea)
 *   env.FLAGS_SOURCE  → drafts / history / audit (control plane)
 *   env.FLAGS_RUNTIME → published snapshots apps read (data plane)
 *
 * ## Caveat: the panel UI is API-only on Workers
 * `createFetchHandler` serves the bundled admin SPA from the local filesystem
 * (`node:fs`), which a Worker has no access to. So on Workers it serves the JSON
 * API plus a minimal fallback page — fully functional for programmatic admin and
 * for the OFREP endpoints, but not the rich React panel. To get the visual panel,
 * run the panel from a Node/Bun origin (see examples/elysia) pointed at the SAME
 * KV namespaces (via the Cloudflare KV REST API or `wrangler kv`), and keep this
 * Worker for edge evaluation. The README explains the options.
 */
import { createFetchHandler } from "@xtandard/flags";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createCloudflareKvStorage } from "@xtandard/flags/storage/cloudflare-kv";
import type { KVNamespaceLike } from "@xtandard/flags/storage/cloudflare-kv";
import type { XtandardOpenFeatureProvider } from "@xtandard/flags/openfeature";

/** The two KV namespace bindings declared in wrangler.toml. */
interface Env {
  FLAGS_SOURCE: KVNamespaceLike;
  FLAGS_RUNTIME: KVNamespaceLike;
}

// The provider is process-global so it survives across requests on a warm
// isolate (its in-memory snapshot is reused; KV is touched only on refresh).
let provider: XtandardOpenFeatureProvider | undefined;
let providerReady: Promise<void> | undefined;

/** Lazily build + initialize the OpenFeature provider over the runtime KV. */
function getProvider(env: Env): Promise<XtandardOpenFeatureProvider> {
  if (!provider) {
    provider = createOpenFeatureProvider({
      storage: createCloudflareKvStorage({ namespace: env.FLAGS_RUNTIME }),
      // KV is not watchable; poll. A short interval keeps a warm isolate fresh.
      refreshIntervalMs: 10_000,
    });
    providerReady = provider.initialize();
  }
  return providerReady!.then(() => provider!);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --- Admin API under /flags/* (JSON API + fallback page; see caveat above). ---
    if (url.pathname === "/flags" || url.pathname.startsWith("/flags/")) {
      const { fetch: panel } = createFetchHandler({
        basePath: "/flags",
        title: "Acme Flags (edge)",
        sourceStorage: createCloudflareKvStorage({ namespace: env.FLAGS_SOURCE }),
        runtimeStorage: createCloudflareKvStorage({ namespace: env.FLAGS_RUNTIME }),
      });
      return panel(request);
    }

    // --- Flag-driven demo page at / (evaluated on the edge from KV). ---
    if (url.pathname === "/") {
      const p = await getProvider(env);
      const ctx = { targetingKey: "demo-user", country: "FR", plan: "beta" };
      const greeting = await p.resolveStringEvaluation("greeting", "Hello from the edge.", ctx);
      const color = await p.resolveStringEvaluation("banner-color", "#2563eb", ctx);
      return new Response(renderPage(greeting.value, color.value, greeting.reason ?? "UNKNOWN"), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

/** Minimal flag-driven page. Both the headline and banner color come from flags. */
function renderPage(greeting: string, bannerColor: string, reason: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>@xtandard/flags on Cloudflare Workers</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    .banner { color: #fff; padding: 1rem; border-radius: 8px; font-weight: 600; }
    code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
    .meta { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="banner" style="background: ${bannerColor};">${greeting}</div>
  <p>This page is evaluated <strong>on the edge</strong> by a Cloudflare Worker,
     reading published snapshots from Workers KV via the
     <code>@xtandard/flags</code> OpenFeature provider.</p>
  <ul class="meta">
    <li><code>greeting</code> (string) → <strong>${greeting}</strong> — reason <code>${reason}</code></li>
    <li><code>banner-color</code> (string) → <code>${bannerColor}</code></li>
  </ul>
  <p class="meta">
    Publish flags via the admin API at <code>/flags/api</code> (e.g. with
    <code>curl</code>), then refresh. If you see defaults, nothing is published yet.
  </p>
</body>
</html>`;
}
