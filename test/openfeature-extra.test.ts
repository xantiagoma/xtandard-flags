import { describe, expect, test } from "vitest";
import { createOpenFeatureProvider } from "../src/openfeature.ts";
import { SnapshotStore } from "../src/snapshot.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import type { FlagsStorage, StorageChangeEvent } from "../src/storage/contract.ts";
import { draft, themeFlag } from "./fixtures.ts";

describe("openfeature — lastUpdatedAt", () => {
  test("is null before any load and set after a successful load", async () => {
    const storage = createMemoryStorage();
    await new SnapshotStore(storage).publish(draft([themeFlag()]));
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    expect(provider.lastUpdatedAt).toBeNull();
    await provider.initialize();
    expect(typeof provider.lastUpdatedAt).toBe("string");
    await provider.onClose();
  });
});

describe("openfeature — evaluation ERROR maps to GENERAL", () => {
  test("a flag whose evaluation errors resolves the caller default with GENERAL", async () => {
    const storage = createMemoryStorage();
    // Publish a flag that will error at evaluation time: override → unknown variant.
    // (compileDraft does not re-validate, so this reaches the evaluator's ERROR path.)
    const store = new SnapshotStore(storage);
    await store.publish(
      draft([themeFlag({ overrides: [{ targetingKey: "u1", variant: "ghost" }] })]),
    );
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();
    const r = await provider.resolveStringEvaluation("theme", "fallback", { targetingKey: "u1" });
    expect(r.value).toBe("fallback");
    expect(r.reason).toBe("ERROR");
    expect(r.errorCode).toBe("GENERAL");
    await provider.onClose();
  });
});

describe("openfeature — watch error handling", () => {
  test("a watch() that rejects is logged and does not break initialize", async () => {
    const base = createMemoryStorage();
    await new SnapshotStore(base).publish(draft([themeFlag()]));
    const errors: string[] = [];
    const watchable: FlagsStorage & {
      watch: (p: string, cb: (e: StorageChangeEvent) => void) => Promise<() => void>;
    } = {
      getItem: (k) => base.getItem(k),
      setItem: (k, v) => base.setItem(k, v),
      removeItem: (k) => base.removeItem(k),
      getKeys: (p) => base.getKeys(p),
      watch: async () => {
        throw new Error("watch unavailable");
      },
    };
    const provider = createOpenFeatureProvider({
      storage: watchable,
      refreshIntervalMs: 0,
      logger: { warn: () => {}, error: (m) => errors.push(m) },
    });
    await expect(provider.initialize()).resolves.toBeUndefined();
    expect(errors.some((e) => e.includes("watch"))).toBe(true);
    await provider.onClose();
  });

  test("an unwatch() that throws is caught and logged on close", async () => {
    const base = createMemoryStorage();
    await new SnapshotStore(base).publish(draft([themeFlag()]));
    const errors: string[] = [];
    const watchable: FlagsStorage & {
      watch: (p: string, cb: (e: StorageChangeEvent) => void) => Promise<() => void>;
    } = {
      getItem: (k) => base.getItem(k),
      setItem: (k, v) => base.setItem(k, v),
      removeItem: (k) => base.removeItem(k),
      getKeys: (p) => base.getKeys(p),
      watch: async () => () => {
        throw new Error("unsubscribe failed");
      },
    };
    const provider = createOpenFeatureProvider({
      storage: watchable,
      refreshIntervalMs: 0,
      logger: { warn: () => {}, error: (m) => errors.push(m) },
    });
    await provider.initialize();
    await expect(provider.onClose()).resolves.toBeUndefined();
    expect(errors.some((e) => e.includes("unsubscrib"))).toBe(true);
  });
});
