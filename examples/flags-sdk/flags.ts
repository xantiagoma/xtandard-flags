/**
 * Wire the Vercel Flags SDK (https://flags-sdk.dev) to @xtandard/flags through
 * its OpenFeature adapter. @xtandard/flags ships a standard OpenFeature provider,
 * so there's no custom glue — the SDK talks to it like any other provider.
 *
 * Flags are evaluated from an in-memory snapshot the provider loads from runtime
 * storage (here, a local file dir shared with the admin panel / `seed.ts`).
 */
import { OpenFeature, type EvaluationContext } from "@openfeature/server-sdk";
import { createOpenFeatureAdapter } from "@flags-sdk/openfeature";
import { dedupe, flag } from "flags/next";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createFileStorage } from "@xtandard/flags/storage/file";

/** Shared runtime-storage dir — point this at the same store your panel publishes to. */
const FLAGS_DATA_DIR = process.env.FLAGS_DATA_DIR ?? "./.flags-data/runtime";

/**
 * Identify the request → an OpenFeature {@link EvaluationContext}. `targetingKey`
 * drives deterministic splits and targeting rules. `dedupe` ensures it runs once
 * per request even if many flags are evaluated.
 *
 * In a real app, derive this from the session / cookies / headers.
 */
export const identify = dedupe(
  async (): Promise<EvaluationContext> => ({
    targetingKey: "user_demo",
    country: "FR",
    plan: "beta",
  }),
);

/**
 * Async adapter: build @xtandard/flags' memory-first OpenFeature provider, set it
 * on OpenFeature, and hand the SDK the client. Created once and reused.
 */
const openFeature = createOpenFeatureAdapter(async () => {
  const provider = createOpenFeatureProvider({
    storage: createFileStorage({ dir: FLAGS_DATA_DIR }),
    projectKey: "default",
    environmentKey: "production",
    refreshIntervalMs: 10_000,
  });
  await OpenFeature.setProviderAndWait(provider);
  return OpenFeature.getClient();
});

// `defaultValue` is required with the OpenFeature adapter — it's what the SDK
// serves if the flag is missing or the provider can't resolve it.

export const newCheckout = flag<boolean, EvaluationContext>({
  key: "new-checkout",
  identify,
  defaultValue: false,
  adapter: openFeature.booleanValue(),
});

export const bannerColor = flag<string, EvaluationContext>({
  key: "banner-color",
  identify,
  defaultValue: "#2563eb",
  adapter: openFeature.stringValue(),
});

export const homeLayout = flag<{ columns: number; hero: string }, EvaluationContext>({
  key: "home-layout",
  identify,
  defaultValue: { columns: 2, hero: "static" },
  adapter: openFeature.objectValue(),
});
