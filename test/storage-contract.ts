/**
 * Reusable conformance suite for the {@link FlagsStorage} contract. Storage
 * adapters can run the same battery of behavioural tests against their
 * implementation by calling {@link runStorageContractTests}.
 *
 * This file deliberately omits the `.test.ts` suffix so vitest does not pick it
 * up as a standalone suite — it only runs when imported by an adapter's test.
 *
 * @module
 */

import { describe, expect, test } from "vitest";
import type { FlagsStorage } from "../src/storage/contract.ts";

/** A factory producing a fresh, empty storage for each test. */
export type MakeStorage = () => Promise<FlagsStorage> | FlagsStorage;

/**
 * Register a `describe(name, …)` block exercising the full {@link FlagsStorage}
 * contract: object round-trips, null-for-missing, remove semantics, prefix
 * listing, and prefix isolation.
 */
export function runStorageContractTests(name: string, makeStorage: MakeStorage): void {
  describe(`FlagsStorage contract: ${name}`, () => {
    test("returns null for a missing key", async () => {
      const storage = await makeStorage();
      expect(await storage.getItem("flags/p/e/missing")).toBeNull();
    });

    test("round-trips an object value", async () => {
      const storage = await makeStorage();
      const value = { enabled: true, rollout: 42, tags: ["a", "b"], nested: { x: 1 } };
      await storage.setItem("flags/p/e/snapshots/v1", value);
      expect(await storage.getItem("flags/p/e/snapshots/v1")).toEqual(value);
    });

    test("round-trips primitive values", async () => {
      const storage = await makeStorage();
      await storage.setItem("flags/p/e/active", "v3");
      expect(await storage.getItem("flags/p/e/active")).toBe("v3");
    });

    test("overwrites an existing key", async () => {
      const storage = await makeStorage();
      await storage.setItem("flags/p/e/k", { v: 1 });
      await storage.setItem("flags/p/e/k", { v: 2 });
      expect(await storage.getItem("flags/p/e/k")).toEqual({ v: 2 });
    });

    test("removeItem deletes a key", async () => {
      const storage = await makeStorage();
      await storage.setItem("flags/p/e/k", { v: 1 });
      await storage.removeItem("flags/p/e/k");
      expect(await storage.getItem("flags/p/e/k")).toBeNull();
    });

    test("removeItem on a missing key is a no-op", async () => {
      const storage = await makeStorage();
      await expect(storage.removeItem("flags/p/e/nope")).resolves.toBeUndefined();
    });

    test("getKeys returns nested keys under a prefix", async () => {
      const storage = await makeStorage();
      await storage.setItem("flags/p/e/snapshots/v1", { v: 1 });
      await storage.setItem("flags/p/e/snapshots/v2", { v: 2 });
      await storage.setItem("flags/p/e/active", "v2");
      const keys = await storage.getKeys("flags/p/e/");
      expect(keys.sort()).toEqual(
        ["flags/p/e/active", "flags/p/e/snapshots/v1", "flags/p/e/snapshots/v2"].sort(),
      );
    });

    test("getKeys isolates by prefix", async () => {
      const storage = await makeStorage();
      await storage.setItem("flags/p1/e/a", { v: 1 });
      await storage.setItem("flags/p2/e/b", { v: 2 });
      expect(await storage.getKeys("flags/p1/")).toEqual(["flags/p1/e/a"]);
      expect(await storage.getKeys("flags/p2/")).toEqual(["flags/p2/e/b"]);
    });

    test("getKeys returns an empty array when nothing matches", async () => {
      const storage = await makeStorage();
      await storage.setItem("flags/p/e/a", { v: 1 });
      expect(await storage.getKeys("flags/other/")).toEqual([]);
    });
  });
}
