import { describe, expect, test } from "vitest";
import {
  isCompareAndSwap,
  isTransactional,
  isWatchable,
  requirePeer,
} from "../src/storage/contract.ts";
import type { FlagsStorage } from "../src/storage/contract.ts";

const plain: FlagsStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
  getKeys: async () => [],
};

describe("storage capability feature-detection", () => {
  test("isWatchable", () => {
    expect(isWatchable(plain)).toBe(false);
    const watchable: FlagsStorage = { ...plain, watch: async () => () => {} } as FlagsStorage;
    expect(isWatchable(watchable)).toBe(true);
  });

  test("isTransactional", () => {
    expect(isTransactional(plain)).toBe(false);
    const tx: FlagsStorage = {
      ...plain,
      transaction: async (cb: (s: FlagsStorage) => unknown) => cb(plain),
    } as FlagsStorage;
    expect(isTransactional(tx)).toBe(true);
  });

  test("isCompareAndSwap", () => {
    expect(isCompareAndSwap(plain)).toBe(false);
    const cas: FlagsStorage = { ...plain, compareAndSwap: async () => true } as FlagsStorage;
    expect(isCompareAndSwap(cas)).toBe(true);
  });
});

describe("requirePeer", () => {
  test("throws an actionable install message", () => {
    expect(() => requirePeer("redis", "storage/redis")).toThrow(
      /@xtandard\/flags\/storage\/redis requires the "redis" package/,
    );
    expect(() => requirePeer("redis", "storage/redis")).toThrow(/bun add redis/);
  });
});
