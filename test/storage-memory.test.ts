import { describe, expect, it, test } from "vitest";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { isCompareAndSwap, isWatchable } from "../src/storage/contract.ts";
import { runStorageContractTests } from "./storage-contract.ts";

runStorageContractTests("memory", () => createMemoryStorage(), {
  t: { describe, test, expect },
  capabilities: { compareAndSwap: true, watch: { settleMs: 5 } },
});

describe("memory storage extras", () => {
  it("implements watch and compare-and-swap", () => {
    const storage = createMemoryStorage();
    expect(isWatchable(storage)).toBe(true);
    expect(isCompareAndSwap(storage)).toBe(true);
  });

  it("seeds initial data", async () => {
    const storage = createMemoryStorage({ initial: { "flags/p/e/active_version": "v1" } });
    expect(await storage.getItem("flags/p/e/active_version")).toBe("v1");
  });
});
