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
 * listing and isolation, and keys kept exact: distinct by case and accent, with wildcard,
 * escape and separator-like characters (`% _ ! * [ ] ? \\`) taken literally.
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

    test("keys differing only by case or accent are distinct", async () => {
      const storage = await makeStorage();
      const keys = ["flags/Acme/e/k", "flags/acme/e/k", "flags/café/e/k", "flags/cafe/e/k"];
      for (const [i, key] of keys.entries()) await storage.setItem(key, { i });
      for (const [i, key] of keys.entries()) expect(await storage.getItem(key)).toEqual({ i });
      expect(await storage.getKeys("flags/Acme/")).toEqual(["flags/Acme/e/k"]);
      expect(await storage.getKeys("flags/acme/")).toEqual(["flags/acme/e/k"]);
      expect(await storage.getKeys("flags/café/")).toEqual(["flags/café/e/k"]);
      await storage.removeItem("flags/Acme/e/k");
      expect(await storage.getItem("flags/acme/e/k")).toEqual({ i: 1 });
    });

    test("keys with ?, \\ and : round-trip exactly and stay distinct", async () => {
      const storage = await makeStorage();
      // Backends that normalize keys (cut at `?`, `\\` or `:` as a separator) would merge these.
      const keys = ["flags/a?b/k", "flags/a/k", "flags/a\\b/k", "flags/a/b/k", "flags/a:b/k"];
      for (const [i, key] of keys.entries()) await storage.setItem(key, { i });
      for (const [i, key] of keys.entries()) expect(await storage.getItem(key)).toEqual({ i });
      expect((await storage.getKeys("flags/")).sort()).toEqual([...keys].sort());
      expect(await storage.getKeys("flags/a?b/")).toEqual(["flags/a?b/k"]);
      expect(await storage.getKeys("flags/a\\b/")).toEqual(["flags/a\\b/k"]);
    });

    test("getKeys matches %, _, !, *, [, ], ? and \\ in the prefix literally", async () => {
      const storage = await makeStorage();
      const prefix = "flags/a%b_c!d*e[f]g?h\\i:j%25/";
      await storage.setItem(`${prefix}k`, { v: 1 });
      // Each would match if that character acted as a LIKE/glob/regex wildcard or escape.
      for (const other of [
        "flags/aXXbYc!d*e[f]g?h\\i/k",
        "flags/a%bZc!d*e[f]g?h\\i/k",
        "flags/a%b_cd*e[f]g?h\\i/k",
        "flags/a%b_c!dXXe[f]g?h\\i/k",
        "flags/a%b_c!d*efgZh\\i/k",
        "flags/a%b_c!d*e[f]gXhi/k",
      ])
        await storage.setItem(other, { v: 2 });
      expect(await storage.getKeys(prefix)).toEqual([`${prefix}k`]);
    });

    test("getKeys is a plain string prefix, not a path segment", async () => {
      const storage = await makeStorage();
      const keys = ["flags/a/k", "flags/ab/k", "flags/a%y/k", "flags/a:b/k", "flags/a%25/k"];
      for (const key of keys) await storage.setItem(key, { key });
      await storage.setItem("flags/b/k", { key: "flags/b/k" });
      expect((await storage.getKeys("flags/a")).sort()).toEqual([...keys].sort());
      expect((await storage.getKeys("flags/a%")).sort()).toEqual(["flags/a%25/k", "flags/a%y/k"]);
      expect(await storage.getKeys("flags/a%25")).toEqual(["flags/a%25/k"]);
      expect(await storage.getItem("flags/a%25/k")).toEqual({ key: "flags/a%25/k" });
    });

    test("getKeys returns an empty array when nothing matches", async () => {
      const storage = await makeStorage();
      await storage.setItem("flags/p/e/a", { v: 1 });
      expect(await storage.getKeys("flags/other/")).toEqual([]);
    });
  });
}
