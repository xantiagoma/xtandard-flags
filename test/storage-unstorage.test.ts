import { createStorage } from "unstorage";
import { describe, expect, test } from "vitest";
import { createUnstorageStorage } from "../src/storage/unstorage.ts";
import { runStorageContractTests } from "./storage-contract.ts";

runStorageContractTests("unstorage (memory driver)", () =>
  createUnstorageStorage({ storage: createStorage() }),
);

describe("createUnstorageStorage specifics", () => {
  test("getKeys returns slash-separated keys, not unstorage's colon form", async () => {
    const storage = createUnstorageStorage({ storage: createStorage() });
    await storage.setItem("flags/p/e/snapshots/v1", { v: 1 });
    await storage.setItem("flags/p/e/active", "v1");
    const keys = await storage.getKeys("flags/p/");
    expect(keys.sort()).toEqual(["flags/p/e/active", "flags/p/e/snapshots/v1"]);
    for (const k of keys) expect(k).not.toContain(":");
  });

  test("auto-deserializes JSON values and yields null for missing", async () => {
    const storage = createUnstorageStorage({ storage: createStorage() });
    expect(await storage.getItem("flags/p/e/none")).toBeNull();
    await storage.setItem("flags/p/e/obj", { nested: { ok: true } });
    expect(await storage.getItem("flags/p/e/obj")).toEqual({ nested: { ok: true } });
  });
});
