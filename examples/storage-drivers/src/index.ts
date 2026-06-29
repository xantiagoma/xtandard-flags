/**
 * A tour of storage backends. Every backend implements the same `FlagsStorage`
 * contract, so they are interchangeable as `sourceStorage` / `runtimeStorage`.
 *
 *   bun run src/index.ts
 *
 * Uncomment the backend you want. Install its peer dep first (see comments).
 */
import { createFlagsCore } from "@xtandard/flags";
import type { FlagsStorage } from "@xtandard/flags";

async function makeStorage(): Promise<FlagsStorage> {
  // ── Memory (no deps) ──────────────────────────────────────────────────────
  const { createMemoryStorage } = await import("@xtandard/flags/storage/memory");
  return createMemoryStorage();

  // ── File (no deps) ────────────────────────────────────────────────────────
  // const { createFileStorage } = await import("@xtandard/flags/storage/file");
  // return createFileStorage({ dir: "./.flags" });

  // ── Redis  ·  bun add redis ───────────────────────────────────────────────
  // const { createRedisStorage } = await import("@xtandard/flags/storage/redis");
  // return createRedisStorage({ url: process.env.REDIS_URL!, prefix: "flags:runtime" });

  // ── Postgres  ·  bun add pg ───────────────────────────────────────────────
  // const { createPostgresStorage } = await import("@xtandard/flags/storage/postgres");
  // return createPostgresStorage({ connectionString: process.env.DATABASE_URL! });

  // ── MongoDB  ·  bun add mongodb ───────────────────────────────────────────
  // const { createMongoStorage } = await import("@xtandard/flags/storage/mongodb");
  // return createMongoStorage({ url: process.env.MONGO_URL! });

  // ── unstorage  ·  bun add unstorage  ──────────────────────────────────────
  // unstorage bridges DOZENS of backends through one adapter. A few notable ones:
  //
  //   Upstash Redis (serverless):   bun add @upstash/redis
  //     import upstash from "unstorage/drivers/upstash";
  //     createStorage({ driver: upstash({ url, token }) })
  //
  //   Vercel KV:                    import vercelKV from "unstorage/drivers/vercel-kv";
  //   Cloudflare KV (binding):      import cfKV from "unstorage/drivers/cloudflare-kv-binding";
  //   AWS S3:                       import s3 from "unstorage/drivers/s3";
  //   GitHub (GitOps source):       import gh from "unstorage/drivers/github";
  //   Netlify Blobs:                import netlify from "unstorage/drivers/netlify-blobs";
  //
  // const { createUnstorageStorage } = await import("@xtandard/flags/storage/unstorage");
  // const { createStorage } = await import("unstorage");
  // const upstash = (await import("unstorage/drivers/upstash")).default;
  // return createUnstorageStorage({
  //   storage: createStorage({ driver: upstash({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }) }),
  // });
}

const storage = await makeStorage();
const core = createFlagsCore({ sourceStorage: storage });

await core.upsertFlag({
  key: "demo",
  type: "boolean",
  enabled: true,
  defaultVariant: "off",
  variants: { on: { value: true }, off: { value: false } },
  fallthrough: { variant: "on" },
});
const snap = await core.publish({ message: "hello from storage-drivers demo" });
console.log(`Published ${snap.version} with flags:`, Object.keys(snap.flags));
