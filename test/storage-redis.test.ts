import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { asRedisClient, fakeRedis } from "@xtandard/kit/storage/testing";
import {
  createRedisJSONStorage,
  createRedisStorage,
  type RedisFlagsStorage,
} from "../src/storage/redis.ts";
import { isCompareAndSwap, isWatchable } from "../src/storage/contract.ts";
import { runStorageContractTests } from "./storage-contract.ts";

const REDIS_URL = process.env.REDIS_URL;

/**
 * Live conformance suite — runs only when `REDIS_URL` is set, so CI without a
 * Redis server simply skips it. Every `makeStorage` call gets a unique key
 * prefix (with glob characters, so `SCAN MATCH` and `PSUBSCRIBE` must escape it)
 * and everything is cleaned up and closed in `afterAll`.
 */
describe.skipIf(!REDIS_URL)("redis storage (live conformance)", () => {
  const runId = `xtandard-flags-test:${Date.now()}`;
  let counter = 0;
  const opened: RedisFlagsStorage[] = [];

  runStorageContractTests(
    "redis",
    () => {
      const storage = createRedisStorage({ url: REDIS_URL, prefix: `${runId}:[${counter++}]*?` });
      opened.push(storage);
      return storage;
    },
    {
      t: { describe, test, expect },
      capabilities: { compareAndSwap: true, watch: { settleMs: 150 } },
      timeout: 30_000,
    },
  );

  beforeAll(async () => {
    // Keyspace notifications are off by default (e.g. the CI redis service).
    const { createClient } = (await import("redis")) as unknown as {
      createClient: (opts: Record<string, unknown>) => {
        connect(): Promise<unknown>;
        configSet(p: string, v: string): Promise<unknown>;
        quit(): Promise<unknown>;
      };
    };
    const cfg = createClient({ url: REDIS_URL });
    await cfg.connect();
    await cfg.configSet("notify-keyspace-events", "KEA");
    await cfg.quit();
  });

  afterAll(async () => {
    for (const storage of opened) {
      for (const key of await storage.getKeys("")) await storage.removeItem(key);
      await storage.close();
    }
  });
});

/** Conformance on both codecs against the kit's fake client, no server needed. */
for (const [name, create] of [
  ["redis (fake client)", createRedisStorage],
  ["redisJSON (fake client)", createRedisJSONStorage],
] as const) {
  runStorageContractTests(
    name,
    () => create({ client: asRedisClient(fakeRedis()), prefix: "ns" }),
    {
      t: { describe, test, expect },
      capabilities: { compareAndSwap: true, watch: { settleMs: 5 } },
    },
  );
}

describe("createRedisStorage shape", () => {
  test("exposes the FlagsStorage + watch + compareAndSwap + close surface without connecting", () => {
    const storage = createRedisStorage({ url: "redis://localhost:6379", prefix: "x" });
    expect(typeof storage.getItem).toBe("function");
    expect(typeof storage.setItem).toBe("function");
    expect(typeof storage.removeItem).toBe("function");
    expect(typeof storage.getKeys).toBe("function");
    expect(typeof storage.close).toBe("function");
    expect(isWatchable(storage)).toBe(true);
    expect(isCompareAndSwap(storage)).toBe(true);
  });

  test("close() before any connection is a safe no-op", async () => {
    const storage = createRedisStorage({ url: "redis://localhost:6379" });
    await expect(storage.close()).resolves.toBeUndefined();
  });

  test("the prefix is joined with `:` and stripped from getKeys", async () => {
    const fake = fakeRedis();
    const storage = createRedisStorage({ client: asRedisClient(fake), prefix: "myapp:flags" });
    await storage.setItem("flags/p/e/active_version", "v1");
    expect(await asRedisClient(fake).get("myapp:flags:flags/p/e/active_version")).toBe('"v1"');
    expect(await storage.getKeys("flags/")).toEqual(["flags/p/e/active_version"]);
  });
});
