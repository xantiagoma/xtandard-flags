/**
 * End-to-end proof of the core promise (spec §17.7):
 *
 *   The admin/control plane — and even storage — can go down, and applications
 *   keep evaluating flags from their in-memory last-known-good snapshot.
 *
 * Requires a running Redis and Docker. Run with:
 *
 *   docker run -d --name flags-e2e-redis -p 6399:6379 redis:7 \
 *     redis-server --notify-keyspace-events KEA
 *   REDIS_URL=redis://localhost:6399 REDIS_CONTAINER=flags-e2e-redis \
 *     bun run e2e/resilience.ts
 *   docker rm -f flags-e2e-redis
 *
 * Exits non-zero if any assertion fails.
 */

import { $ } from "bun";
import { createRedisStorage } from "../src/storage/redis.ts";
import { createFlagsCore } from "../src/core.ts";
import { createOpenFeatureProvider } from "../src/openfeature.ts";

const URL = process.env.REDIS_URL ?? "redis://localhost:6399";
const CONTAINER = process.env.REDIS_CONTAINER ?? "flags-e2e-redis";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failures++;
};

const source = createRedisStorage({ url: URL, prefix: "e2e:source", onError: () => {} });
const runtime = createRedisStorage({ url: URL, prefix: "e2e:runtime", onError: () => {} });
const core = createFlagsCore({ sourceStorage: source, runtimeStorage: runtime });

await core.upsertFlag({
  key: "theme",
  type: "string",
  enabled: true,
  defaultVariant: "normal",
  variants: { normal: { value: "normal" }, xmas: { value: "xmas" } },
  fallthrough: {
    split: [
      { variant: "normal", weight: 50 },
      { variant: "xmas", weight: 50 },
    ],
  },
});
const snap = await core.publish({ message: "e2e" });
ok(snap.version === "v1", `admin published ${snap.version} to Redis`);

const provider = createOpenFeatureProvider({
  storage: runtime,
  refreshIntervalMs: 0,
  logger: { warn() {}, error() {} },
});
await provider.initialize?.({});
const a1 = (await provider.resolveStringEvaluation("theme", "default", { targetingKey: "user_a" }))
  .value;
ok(["normal", "xmas"].includes(a1), `provider resolved from Redis snapshot (user_a=${a1})`);

let stable = true;
for (let i = 0; i < 100; i++) {
  if (
    (await provider.resolveStringEvaluation("theme", "default", { targetingKey: "user_a" }))
      .value !== a1
  ) {
    stable = false;
  }
}
ok(stable, "100 evaluations stable & deterministic (admin never in the request path)");

await $`docker stop ${CONTAINER}`.quiet();
console.log("   …stopped Redis");
await provider.refresh(); // fails fast, keeps last-known-good

const det = await provider.resolveStringEvaluation("theme", "default", { targetingKey: "user_a" });
ok(
  det.value === a1,
  `after Redis down, provider STILL serves last-known-good (user_a=${det.value})`,
);
ok(det.flagMetadata?.stale === true, `result is flagged stale=${det.flagMetadata?.stale}`);
const c = (await provider.resolveStringEvaluation("theme", "default", { targetingKey: "user_c" }))
  .value;
ok(
  ["normal", "xmas"].includes(c),
  `a brand-new user resolves from memory while Redis is down (user_c=${c})`,
);

await provider.onClose?.();

if (failures === 0) {
  console.log("\nE2E RESILIENCE PASSED — control plane/storage down, apps keep evaluating. ✔");
  process.exit(0);
} else {
  console.error(`\nE2E RESILIENCE FAILED — ${failures} assertion(s) failed.`);
  process.exit(1);
}
