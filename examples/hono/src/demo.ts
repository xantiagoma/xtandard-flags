/**
 * Shared bits for the demo page: an idempotent seed and the HTML renderer.
 * Kept tiny and framework-agnostic so elysia/hono/express can share the shape.
 */
import { createFlagsCore, type FlagsStorage } from "@xtandard/flags";

export interface DemoFlags {
  newGreeting: boolean;
  bannerColor: string;
  maxItems: number;
}

/**
 * Publish an initial draft only if nothing is published yet. Safe to call on
 * every boot — once the panel has published, this no-ops and never clobbers
 * your edits. Writes to BOTH source and runtime via the core's publish().
 */
export async function seedIfEmpty(storage: {
  sourceStorage: FlagsStorage;
  runtimeStorage: FlagsStorage;
}): Promise<void> {
  const core = createFlagsCore(storage);
  if (await core.getActiveVersion()) return; // already published — leave it alone

  await core.upsertFlag({
    key: "new-greeting",
    type: "boolean",
    enabled: true,
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
  });
  await core.upsertFlag({
    key: "banner-color",
    type: "string",
    enabled: true,
    defaultVariant: "blue",
    variants: { blue: { value: "#2563eb" }, green: { value: "#16a34a" } },
    fallthrough: { variant: "blue" },
  });
  await core.upsertFlag({
    key: "max-items",
    type: "number",
    enabled: true,
    defaultVariant: "three",
    variants: { three: { value: 3 }, six: { value: 6 } },
    fallthrough: { variant: "three" },
  });

  await core.publish({ message: "seed demo flags" });
}

/** Render the demo page. Every visible element is driven by a flag value. */
export function renderDemoPage({ newGreeting, bannerColor, maxItems }: DemoFlags): string {
  const greeting = newGreeting
    ? "✨ Welcome to the NEW experience!"
    : "Hello from the old greeting.";
  const items = Array.from(
    { length: maxItems },
    (_, i) => `<li>Item ${i + 1}</li>`,
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>@xtandard/flags demo</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    .banner { color: #fff; padding: 1rem; border-radius: 8px; font-weight: 600; }
    code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
    .meta { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="banner" style="background: ${bannerColor};">${greeting}</div>
  <p>This page is rendered from three flags resolved through the
     <code>@xtandard/flags</code> OpenFeature provider:</p>
  <ul class="meta">
    <li><code>new-greeting</code> (boolean) → <strong>${newGreeting}</strong> — flips the headline.</li>
    <li><code>banner-color</code> (string) → <code>${bannerColor}</code> — sets the banner color.</li>
    <li><code>max-items</code> (number) → <strong>${maxItems}</strong> — how many items render below.</li>
  </ul>
  <ol>${items}</ol>
  <hr />
  <p><a href="/flags">Open the admin panel →</a></p>
  <p class="meta">Change a flag, click <strong>Publish</strong>, then refresh this page.</p>
</body>
</html>`;
}
