import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createRedisStorage, type RedisFlagsStorage } from "../src/storage/redis.ts";

const REDIS_URL = process.env.REDIS_URL;

/**
 * Integration suite — runs only when `REDIS_URL` is set, so CI without a Redis
 * server simply skips it. Uses a unique key prefix per run so it never collides
 * with real data and cleans up after itself.
 */
describe.skipIf(!REDIS_URL)("createRedisStorage (live)", () => {
  const prefix = `xtandard-flags-test:${Date.now()}`;
  let storage: RedisFlagsStorage;

  beforeAll(() => {
    storage = createRedisStorage({ url: REDIS_URL, prefix });
  });

  afterAll(async () => {
    for (const key of await storage.getKeys("")) await storage.removeItem(key);
    await storage.close();
  });

  test("returns null for a missing key", async () => {
    expect(await storage.getItem("flags/p/e/missing")).toBeNull();
  });

  test("round-trips an object value", async () => {
    const value = { enabled: true, rollout: 42, nested: { x: 1 } };
    await storage.setItem("flags/p/e/snapshots/v1", value);
    expect(await storage.getItem("flags/p/e/snapshots/v1")).toEqual(value);
  });

  test("removeItem deletes a key", async () => {
    await storage.setItem("flags/p/e/k", { v: 1 });
    await storage.removeItem("flags/p/e/k");
    expect(await storage.getItem("flags/p/e/k")).toBeNull();
  });

  test("getKeys lists matching keys with the prefix stripped", async () => {
    await storage.setItem("flags/p/e/a", { v: 1 });
    await storage.setItem("flags/p/e/b", { v: 2 });
    const keys = await storage.getKeys("flags/p/e/");
    expect(keys).toContain("flags/p/e/a");
    expect(keys).toContain("flags/p/e/b");
    for (const k of keys) expect(k.startsWith(prefix)).toBe(false);
  });

  test("getKeys isolates by prefix", async () => {
    await storage.setItem("flags/iso1/e/a", { v: 1 });
    await storage.setItem("flags/iso2/e/b", { v: 2 });
    expect(await storage.getKeys("flags/iso1/")).toEqual(["flags/iso1/e/a"]);
    expect(await storage.getKeys("flags/iso2/")).toEqual(["flags/iso2/e/b"]);
  });

  test("watch delivers update and remove events (keyspace notifications)", async () => {
    const events: { type: string; key: string }[] = [];
    const off = await storage.watch("flags/watch/", (e) => events.push(e));
    await storage.setItem("flags/watch/e/k", { v: 1 });
    await storage.removeItem("flags/watch/e/k");
    // Give pub/sub a moment to deliver.
    await new Promise((r) => setTimeout(r, 300));
    off();
    expect(events.some((e) => e.type === "update" && e.key === "flags/watch/e/k")).toBe(true);
    expect(events.some((e) => e.type === "remove" && e.key === "flags/watch/e/k")).toBe(true);
  });
});

describe.skipIf(!REDIS_URL)("createRedisStorage — borrowed client", () => {
  test("close() is a no-op for a client the adapter did not create", async () => {
    const { createClient } = (await import("redis")) as unknown as {
      createClient: (opts: Record<string, unknown>) => {
        connect(): Promise<unknown>;
        isOpen: boolean;
        quit(): Promise<unknown>;
      };
    };
    const client = createClient({ url: REDIS_URL });
    await client.connect();
    const storage = createRedisStorage({
      client: client as never,
      prefix: `borrowed:${Date.now()}`,
    });
    await storage.setItem("flags/b/k", { v: 1 });
    expect(await storage.getItem("flags/b/k")).toEqual({ v: 1 });
    // close() must NOT disconnect a borrowed client.
    await storage.close();
    expect(client.isOpen).toBe(true);
    // clean up the client ourselves.
    await client.quit();
  });

  test("onError handler is observable (attaches without throwing)", () => {
    const errors: unknown[] = [];
    const storage = createRedisStorage({
      url: "redis://localhost:6399",
      onError: (e) => errors.push(e),
    });
    expect(typeof storage.close).toBe("function");
  });
});

/**
 * Type/shape checks that need no live server: a created adapter exposes the
 * full {@link RedisFlagsStorage} surface (the contract methods plus `close`).
 */
describe("createRedisStorage shape", () => {
  test("exposes the FlagsStorage + watch + close surface without connecting", () => {
    const storage = createRedisStorage({ url: "redis://localhost:6379", prefix: "x" });
    expect(typeof storage.getItem).toBe("function");
    expect(typeof storage.setItem).toBe("function");
    expect(typeof storage.removeItem).toBe("function");
    expect(typeof storage.getKeys).toBe("function");
    expect(typeof storage.watch).toBe("function");
    expect(typeof storage.close).toBe("function");
  });

  test("close() before any connection is a safe no-op", async () => {
    const storage = createRedisStorage({ url: "redis://localhost:6379" });
    await expect(storage.close()).resolves.toBeUndefined();
  });

  test("getKeys handles scanIterator yielding batched arrays (node-redis v5)", async () => {
    // A fake client whose scanIterator yields an array of keys in one step, with
    // the namespace prefix attached, to exercise the array-batch branch.
    const fake = {
      isOpen: true,
      on() {},
      async connect() {},
      async quit() {},
      async get() {
        return null;
      },
      async set() {},
      async del() {},
      // eslint-disable-next-line require-yield
      async *scanIterator() {
        yield ["x:flags/a", "x:flags/b"];
      },
      duplicate() {
        return fake;
      },
      async pSubscribe() {},
      async disconnect() {},
    };
    const storage = createRedisStorage({ client: fake as never, prefix: "x" });
    const keys = await storage.getKeys("flags/");
    expect(keys.sort()).toEqual(["flags/a", "flags/b"]);
  });
});
