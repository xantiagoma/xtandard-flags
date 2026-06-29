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
});
