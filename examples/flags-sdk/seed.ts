/**
 * Seed the local runtime storage with a few published flags so the app shows
 * non-default values out of the box. In production you'd author + publish these
 * from the @xtandard/flags admin panel instead.
 *
 *   bun run seed
 */
import { createFlagsCore } from "@xtandard/flags";
import { createFileStorage } from "@xtandard/flags/storage/file";

// Publish to the same two dirs the in-app admin panel uses (see
// `app/flags/[[...path]]/route.ts`): source holds drafts/history, runtime holds
// the published snapshots the app evaluates from.
const sourceDir = process.env.FLAGS_SOURCE_DIR ?? "./.flags-data/source";
const runtimeDir = process.env.FLAGS_DATA_DIR ?? "./.flags-data/runtime";
const core = createFlagsCore({
  sourceStorage: createFileStorage({ dir: sourceDir }),
  runtimeStorage: createFileStorage({ dir: runtimeDir }),
});

await core.upsertFlag({
  key: "new-checkout",
  type: "boolean",
  enabled: true,
  defaultVariant: "off",
  variants: { on: { value: true }, off: { value: false } },
  fallthrough: { variant: "off" },
  // EU beta users get it on (matches the identify() context below).
  rules: [
    {
      id: "eu-beta",
      conditions: [
        { attribute: "country", operator: "in", value: ["FR", "DE", "ES"] },
        { attribute: "plan", operator: "equals", value: "beta" },
      ],
      serve: { variant: "on" },
    },
  ],
});

await core.upsertFlag({
  key: "banner-color",
  type: "string",
  enabled: true,
  defaultVariant: "green",
  variants: { blue: { value: "#2563eb" }, green: { value: "#16a34a" } },
  fallthrough: { variant: "green" },
});

await core.upsertFlag({
  key: "home-layout",
  type: "json",
  enabled: true,
  defaultVariant: "treatment",
  variants: {
    control: { value: { columns: 2, hero: "static" } },
    treatment: { value: { columns: 3, hero: "carousel" } },
  },
  fallthrough: { variant: "treatment" },
});

const snapshot = await core.publish({ message: "seed flags-sdk example" });
console.log(`Published ${snapshot.version} to ${runtimeDir}. Now run: bun run dev`);
