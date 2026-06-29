/**
 * Consume flags at runtime via OpenFeature + Redis runtime storage.
 *
 *   bun add @openfeature/server-sdk redis @xtandard/flags
 *   REDIS_URL=redis://localhost:6379 bun run src/index.ts
 *
 * Publish a "theme" string flag from the admin panel first; this process keeps
 * evaluating from its in-memory snapshot even if the panel — or Redis — goes away.
 */
import { OpenFeature } from "@openfeature/server-sdk";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

await OpenFeature.setProviderAndWait(
  createOpenFeatureProvider({
    projectKey: "default",
    environmentKey: "production",
    storage: createRedisStorage({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
      prefix: "xtandard:flags:runtime",
    }),
    refreshIntervalMs: 10_000,
  }),
);

const client = OpenFeature.getClient();

for (const userId of ["user_a", "user_b", "user_c"]) {
  const theme = await client.getStringValue("theme", "normal", {
    targetingKey: userId,
    country: "CO",
  });
  console.log(`${userId} → theme=${theme}`);
}
