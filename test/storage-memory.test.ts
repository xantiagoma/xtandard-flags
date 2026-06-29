import { describe, expect, test } from "vitest";
import { createMemoryStorage } from "../src/storage/memory.ts";
import type { StorageChangeEvent } from "../src/storage/contract.ts";
import { runStorageContractTests } from "./storage-contract.ts";

runStorageContractTests("memory", () => createMemoryStorage());

describe("createMemoryStorage watch", () => {
  test("notifies on update and remove under the prefix", async () => {
    const storage = createMemoryStorage();
    const events: StorageChangeEvent[] = [];
    const unwatch = await storage.watch("flags/p/", (e) => events.push(e));

    await storage.setItem("flags/p/e/k", { v: 1 });
    await storage.removeItem("flags/p/e/k");
    await storage.setItem("flags/other/k", { v: 9 }); // outside prefix, ignored

    // watch callbacks fire on the next microtask.
    await new Promise((r) => queueMicrotask(() => r(undefined)));

    expect(events).toEqual([
      { type: "update", key: "flags/p/e/k" },
      { type: "remove", key: "flags/p/e/k" },
    ]);

    unwatch();
  });

  test("unwatch stops further notifications", async () => {
    const storage = createMemoryStorage();
    const events: StorageChangeEvent[] = [];
    const unwatch = await storage.watch("flags/", (e) => events.push(e));
    unwatch();
    await storage.setItem("flags/p/e/k", { v: 1 });
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    expect(events).toEqual([]);
  });
});
