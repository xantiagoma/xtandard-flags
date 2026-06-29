import { describe, expect, test, vi } from "vitest";
import { createOpenFeatureProvider, toOpenFeatureReason } from "../src/openfeature.ts";
import { SnapshotStore } from "../src/snapshot.ts";
import type { FlagsStorage } from "../src/storage/contract.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, draft, jsonFlag, numberFlag, themeFlag } from "./fixtures.ts";

/** Publish a draft made of the given flags and return the runtime storage. */
async function publish(flags = [booleanFlag(), themeFlag(), numberFlag(), jsonFlag()]) {
  const storage = createMemoryStorage();
  const store = new SnapshotStore(storage);
  await store.publish(draft(flags));
  return storage;
}

describe("toOpenFeatureReason", () => {
  test("maps internal reasons to OpenFeature strings", () => {
    expect(toOpenFeatureReason("STATIC")).toBe("STATIC");
    expect(toOpenFeatureReason("DEFAULT")).toBe("DEFAULT");
    expect(toOpenFeatureReason("TARGETING_MATCH")).toBe("TARGETING_MATCH");
    expect(toOpenFeatureReason("SPLIT")).toBe("SPLIT");
    expect(toOpenFeatureReason("DISABLED")).toBe("DISABLED");
    expect(toOpenFeatureReason("STALE")).toBe("STALE");
    // FLAG_NOT_FOUND and ERROR both surface as ERROR per OF convention.
    expect(toOpenFeatureReason("FLAG_NOT_FOUND")).toBe("ERROR");
    expect(toOpenFeatureReason("ERROR")).toBe("ERROR");
  });
});

describe("createOpenFeatureProvider — happy path", () => {
  test("exposes metadata and runs on the server", () => {
    const provider = createOpenFeatureProvider({ storage: createMemoryStorage() });
    expect(provider.metadata.name).toBe("xtandard-flags");
    expect(provider.runsOn).toBe("server");
  });

  test("resolves a boolean flag with variant + reason", async () => {
    const storage = await publish();
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();

    const r = await provider.resolveBooleanEvaluation("new-dashboard", true, {});
    expect(r.value).toBe(false); // default variant "off"
    expect(r.variant).toBe("off");
    expect(r.reason).toBe("STATIC");
    await provider.onClose();
  });

  test("resolves a string flag", async () => {
    const storage = await publish();
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();

    const r = await provider.resolveStringEvaluation("theme", "fallback", {});
    expect(r.value).toBe("normal");
    expect(r.variant).toBe("normal");
    expect(r.reason).toBe("STATIC");
    await provider.onClose();
  });

  test("resolves a number flag", async () => {
    const storage = await publish();
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();

    const r = await provider.resolveNumberEvaluation("max-items", -1, {});
    expect(r.value).toBe(10);
    expect(r.variant).toBe("low");
    await provider.onClose();
  });

  test("resolves a json/object flag", async () => {
    const storage = await publish();
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();

    const r = await provider.resolveObjectEvaluation("config", { color: "x", limit: 0 }, {});
    expect(r.value).toEqual({ color: "blue", limit: 5 });
    expect(r.variant).toBe("default");
    await provider.onClose();
  });
});

describe("createOpenFeatureProvider — error semantics", () => {
  test("missing flag → caller default with FLAG_NOT_FOUND", async () => {
    const storage = await publish();
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();

    const r = await provider.resolveBooleanEvaluation("does-not-exist", true, {});
    expect(r.value).toBe(true);
    expect(r.reason).toBe("ERROR");
    expect(r.errorCode).toBe("FLAG_NOT_FOUND");
    await provider.onClose();
  });

  test("type mismatch (boolean method on a string flag) → default + TYPE_MISMATCH", async () => {
    const storage = await publish();
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();

    const r = await provider.resolveBooleanEvaluation("theme", false, {});
    expect(r.value).toBe(false);
    expect(r.reason).toBe("ERROR");
    expect(r.errorCode).toBe("TYPE_MISMATCH");
    await provider.onClose();
  });

  test("no snapshot at all (empty storage) → caller default with reason DEFAULT", async () => {
    const provider = createOpenFeatureProvider({
      storage: createMemoryStorage(),
      refreshIntervalMs: 0,
    });
    await provider.initialize();

    const r = await provider.resolveStringEvaluation("theme", "fallback", {});
    expect(r.value).toBe("fallback");
    expect(r.reason).toBe("DEFAULT");
    expect(r.errorCode).toBe("FLAG_NOT_FOUND");
    await provider.onClose();
  });

  test("constructing and resolving without initialize() never throws (serves defaults)", async () => {
    const provider = createOpenFeatureProvider({
      storage: createMemoryStorage(),
      refreshIntervalMs: 0,
    });
    const r = await provider.resolveBooleanEvaluation("anything", true, {});
    expect(r.value).toBe(true);
    expect(r.reason).toBe("DEFAULT");
  });
});

describe("createOpenFeatureProvider — memory-first / failure resilience", () => {
  test("admin/storage down doesn't matter: after one load, resolves from memory with no further reads", async () => {
    const storage = await publish();
    let getItemCalls = 0;
    let getKeysCalls = 0;
    const counting: FlagsStorage = {
      async getItem<T>(key: string): Promise<T | null> {
        getItemCalls++;
        return storage.getItem<T>(key);
      },
      async setItem<T>(key: string, value: T): Promise<void> {
        return storage.setItem(key, value);
      },
      async removeItem(key: string): Promise<void> {
        return storage.removeItem(key);
      },
      async getKeys(prefix: string): Promise<string[]> {
        getKeysCalls++;
        return storage.getKeys(prefix);
      },
    };

    const provider = createOpenFeatureProvider({ storage: counting, refreshIntervalMs: 0 });
    await provider.initialize();
    const afterInit = getItemCalls + getKeysCalls;

    // Resolve many times; storage must not be touched again.
    for (let i = 0; i < 50; i++) {
      const r = await provider.resolveBooleanEvaluation("new-dashboard", true, {
        targetingKey: `u${i}`,
      });
      expect(r.value).toBe(false);
    }
    expect(getItemCalls + getKeysCalls).toBe(afterInit);
    await provider.onClose();
  });

  test("storage down after load: keeps last-known-good and marks stale", async () => {
    const storage = await publish();
    const store = new SnapshotStore(storage);
    const active = await store.getActiveSnapshot("default", "production");
    expect(active).not.toBeNull();

    // A failing storage stub we can swap in for the refresh.
    let fail = false;
    const wrapped: FlagsStorage = {
      async getItem<T>(key: string): Promise<T | null> {
        if (fail) throw new Error("storage down");
        return storage.getItem<T>(key);
      },
      async setItem<T>(key: string, value: T): Promise<void> {
        return storage.setItem(key, value);
      },
      async removeItem(key: string): Promise<void> {
        return storage.removeItem(key);
      },
      async getKeys(prefix: string): Promise<string[]> {
        if (fail) throw new Error("storage down");
        return storage.getKeys(prefix);
      },
    };

    const warnings: string[] = [];
    const provider = createOpenFeatureProvider({
      storage: wrapped,
      refreshIntervalMs: 0,
      logger: { warn: (m) => warnings.push(m), error: () => {} },
    });
    await provider.initialize();
    expect(provider.stale).toBe(false);

    // Storage goes down; force a refresh.
    fail = true;
    await provider.refresh();

    // Still serving the previously-loaded value, now flagged stale.
    const r = await provider.resolveStringEvaluation("theme", "fallback", {});
    expect(r.value).toBe("normal");
    expect(provider.stale).toBe(true);
    expect(r.flagMetadata?.stale).toBe(true);
    expect(warnings.some((w) => w.includes("stale"))).toBe(true);

    // Storage recovers; a successful refresh clears stale.
    fail = false;
    await provider.refresh();
    expect(provider.stale).toBe(false);
    const r2 = await provider.resolveStringEvaluation("theme", "fallback", {});
    expect(r2.flagMetadata?.stale).toBeUndefined();
    await provider.onClose();
  });

  test("initialize() with broken storage does not throw and serves defaults", async () => {
    const broken: FlagsStorage = {
      async getItem(): Promise<never> {
        throw new Error("down");
      },
      async setItem(): Promise<void> {},
      async removeItem(): Promise<void> {},
      async getKeys(): Promise<never> {
        throw new Error("down");
      },
    };
    const provider = createOpenFeatureProvider({
      storage: broken,
      refreshIntervalMs: 0,
      logger: { warn: () => {}, error: () => {} },
    });
    await expect(provider.initialize()).resolves.toBeUndefined();

    const r = await provider.resolveBooleanEvaluation("new-dashboard", true, {});
    expect(r.value).toBe(true);
    expect(r.reason).toBe("DEFAULT");
    await provider.onClose();
  });

  test("background poll refreshes memory after a publish", async () => {
    vi.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      const store = new SnapshotStore(storage);
      await store.publish(draft([themeFlag()]));

      const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 1000 });
      await provider.initialize();

      let r = await provider.resolveStringEvaluation("theme", "fallback", {});
      expect(r.value).toBe("normal");

      // Republish with the flag disabled → default variant served when reloaded.
      await store.publish(draft([themeFlag({ enabled: false, defaultVariant: "xmas" })]));

      // Advance the timer past the interval and let the refresh microtasks settle.
      await vi.advanceTimersByTimeAsync(1100);

      r = await provider.resolveStringEvaluation("theme", "fallback", {});
      expect(r.value).toBe("xmas");
      expect(r.reason).toBe("DISABLED");
      await provider.onClose();
    } finally {
      vi.useRealTimers();
    }
  });

  test("watchable storage triggers a prompt refresh on publish", async () => {
    const storage = createMemoryStorage();
    const store = new SnapshotStore(storage);
    await store.publish(draft([themeFlag()]));

    // Polling disabled; rely solely on watch.
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();

    await store.publish(draft([themeFlag({ enabled: false, defaultVariant: "halloween" })]));

    // Watch refresh is asynchronous (microtask callback + async storage read).
    // Poll briefly until memory reflects the new publish.
    let value = "normal";
    for (let i = 0; i < 50 && value !== "halloween"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      value = (await provider.resolveStringEvaluation("theme", "fallback", {})).value;
    }
    expect(value).toBe("halloween");
    await provider.onClose();
  });
});

describe("createOpenFeatureProvider — splits & lifecycle", () => {
  test("deterministic split resolves consistently for the same targetingKey", async () => {
    const splitFlag = booleanFlag({
      key: "rollout",
      fallthrough: {
        split: [
          { variant: "on", weight: 50 },
          { variant: "off", weight: 50 },
        ],
      },
    });
    const storage = await publish([splitFlag]);
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 0 });
    await provider.initialize();

    const first = await provider.resolveBooleanEvaluation("rollout", false, {
      targetingKey: "stable-user",
    });
    expect(first.reason).toBe("SPLIT");
    for (let i = 0; i < 20; i++) {
      const r = await provider.resolveBooleanEvaluation("rollout", false, {
        targetingKey: "stable-user",
      });
      expect(r.value).toBe(first.value);
      expect(r.variant).toBe(first.variant);
    }
    await provider.onClose();
  });

  test("onClose stops the timer without errors and is idempotent", async () => {
    const storage = await publish();
    const provider = createOpenFeatureProvider({ storage, refreshIntervalMs: 1000 });
    await provider.initialize();
    await expect(provider.onClose()).resolves.toBeUndefined();
    // Second close is a no-op.
    await expect(provider.onClose()).resolves.toBeUndefined();
    // refresh() after close is a no-op and does not throw.
    await expect(provider.refresh()).resolves.toBeUndefined();
  });
});
