/**
 * One contract, every backend.
 *
 *   bun run src/index.ts
 *
 * `FlagsStorage` is four async methods (getItem/setItem/removeItem/getKeys).
 * Every adapter below satisfies exactly that, so any of them can be handed to
 * `createFlagsCore` as `sourceStorage` / `runtimeStorage` — they are
 * interchangeable. This script:
 *
 *   1. constructs each adapter (behind env guards so importing is enough — no
 *      live connection is needed just to *build* one), and prints that it
 *      satisfies the shared contract, then
 *   2. drives the in-memory one end-to-end (upsert → publish) to prove the wiring.
 *
 * Install a backend's peer dep before un-guarding it (see each comment). The
 * memory backend needs nothing and always runs.
 */
import { createFlagsCore } from "@xtandard/flags";
import type { FlagsStorage } from "@xtandard/flags";
import type { KVNamespaceLike } from "@xtandard/flags/storage/cloudflare-kv";

/** The four method names that make up the `FlagsStorage` contract. */
const CONTRACT_METHODS = ["getItem", "setItem", "removeItem", "getKeys"] as const;

/** True iff `value` structurally satisfies `FlagsStorage`. */
function satisfiesContract(value: unknown): value is FlagsStorage {
  return (
    typeof value === "object" &&
    value !== null &&
    CONTRACT_METHODS.every((m) => typeof (value as Record<string, unknown>)[m] === "function")
  );
}

/** Construct each available backend and report contract conformance. */
async function tour(): Promise<void> {
  // ── Memory (no deps) ──────────────────────────────────────────────────────
  const { createMemoryStorage } = await import("@xtandard/flags/storage/memory");
  report("memory", createMemoryStorage());

  // ── File (no deps) ────────────────────────────────────────────────────────
  const { createFileStorage } = await import("@xtandard/flags/storage/file");
  report("file", createFileStorage({ dir: "./.flags" }));

  // ── libSQL / Turso  ·  bun add @libsql/client ─────────────────────────────
  // Edge-distributed SQLite over the network. Constructing the adapter does NOT
  // connect (the client + table are created lazily on first use), so we can build
  // it here without a live database. A local `file:` URL works fully offline; a
  // `libsql://…` URL + auth token points at Turso. See examples/turso for a
  // runnable, seed-publish-evaluate version.
  const { createLibsqlStorage } = await import("@xtandard/flags/storage/libsql");
  report(
    "libsql/turso",
    createLibsqlStorage({
      url: process.env.TURSO_DATABASE_URL ?? "file:flags.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
  );

  // ── Cloudflare KV  ·  NO npm peer dep ─────────────────────────────────────
  // The adapter wraps a Workers `KVNamespace` *binding* — the object Workers
  // exposes on `env.MY_KV`. There is no client library to install: the runtime
  // provides the binding. Here we hand it a tiny in-file fake that satisfies the
  // same `KVNamespaceLike` surface, purely to demonstrate the shape. In a real
  // Worker this is `env.FLAGS_RUNTIME` (see examples/cloudflare-workers).
  const { createCloudflareKvStorage } = await import("@xtandard/flags/storage/cloudflare-kv");
  report("cloudflare-kv", createCloudflareKvStorage({ namespace: fakeKvNamespace() }));

  // ── Redis  ·  bun add redis ───────────────────────────────────────────────
  if (process.env.REDIS_URL) {
    const { createRedisStorage } = await import("@xtandard/flags/storage/redis");
    report("redis", createRedisStorage({ url: process.env.REDIS_URL, prefix: "flags:runtime" }));
  }

  // ── Postgres  ·  bun add pg ───────────────────────────────────────────────
  if (process.env.DATABASE_URL) {
    const { createPostgresStorage } = await import("@xtandard/flags/storage/postgres");
    report("postgres", createPostgresStorage({ connectionString: process.env.DATABASE_URL }));
  }

  // ── MongoDB  ·  bun add mongodb ───────────────────────────────────────────
  if (process.env.MONGO_URL) {
    const { createMongoStorage } = await import("@xtandard/flags/storage/mongodb");
    report("mongodb", createMongoStorage({ url: process.env.MONGO_URL }));
  }

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
  // if (process.env.UPSTASH_REDIS_REST_URL) {
  //   const { createUnstorageStorage } = await import("@xtandard/flags/storage/unstorage");
  //   const { createStorage } = await import("unstorage");
  //   const upstash = (await import("unstorage/drivers/upstash")).default;
  //   report("unstorage/upstash", createUnstorageStorage({
  //     storage: createStorage({ driver: upstash({
  //       url: process.env.UPSTASH_REDIS_REST_URL!,
  //       token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  //     }) }),
  //   }));
  // }
}

/** Print whether `storage` satisfies the `FlagsStorage` contract. */
function report(name: string, storage: unknown): void {
  const ok = satisfiesContract(storage);
  console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(16)} satisfies FlagsStorage`);
}

/**
 * A throwaway in-memory `KVNamespace` for the demo. In a real Worker you never
 * write this — `env.MY_KV` already satisfies `KVNamespaceLike`.
 */
function fakeKvNamespace(): KVNamespaceLike {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async list(options) {
      const prefix = options?.prefix ?? "";
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

console.log("Storage backends — one contract, every backend:\n");
await tour();

// Now drive the simplest one (memory) end-to-end to prove the contract is enough
// to run the whole core: upsert a draft, then publish a snapshot.
console.log("\nDriving the memory backend end-to-end:");
const { createMemoryStorage } = await import("@xtandard/flags/storage/memory");
const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
await core.upsertFlag({
  key: "demo",
  type: "boolean",
  enabled: true,
  defaultVariant: "off",
  variants: { on: { value: true }, off: { value: false } },
  fallthrough: { variant: "on" },
});
const snap = await core.publish({ message: "hello from storage-drivers demo" });
console.log(`  Published ${snap.version} with flags:`, Object.keys(snap.flags));
