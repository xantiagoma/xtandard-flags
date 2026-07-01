import { describe, expect, test, vi } from "vitest";
import { createFlagsCore } from "../src/core.ts";
import type { AfterEvent, BeforeEvent, FlagsHooks } from "../src/hooks/contract.ts";
import { normalizeHooks } from "../src/hooks/contract.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag } from "./fixtures.ts";

const makeCore = (hooks?: FlagsHooks | FlagsHooks[], onHookError?: () => void) =>
  createFlagsCore({ sourceStorage: createMemoryStorage(), hooks, onHookError });

/** A recording hook that captures every before/after event, in call order. */
function recorder() {
  const events: (BeforeEvent | AfterEvent)[] = [];
  const before: BeforeEvent[] = [];
  const after: AfterEvent[] = [];
  const hook: FlagsHooks = {
    before: (e) => {
      before.push(e);
      events.push(e);
    },
    after: (e) => {
      after.push(e);
      events.push(e);
    },
  };
  const reset = () => {
    events.length = 0;
    before.length = 0;
    after.length = 0;
  };
  return { hook, events, before, after, reset, types: () => events.map((e) => e.type) };
}

describe("hooks — normalization", () => {
  test("normalizeHooks handles undefined / single / array", () => {
    const h: FlagsHooks = {};
    expect(normalizeHooks(undefined)).toEqual([]);
    expect(normalizeHooks(h)).toEqual([h]);
    expect(normalizeHooks([h, h])).toEqual([h, h]);
  });

  test("core.options.hooks is always a normalized array", () => {
    expect(makeCore().options.hooks).toEqual([]);
    const h: FlagsHooks = {};
    expect(makeCore(h).options.hooks).toEqual([h]);
    expect(makeCore([h, h]).options.hooks).toHaveLength(2);
  });

  test("no hooks configured is a no-op (mutations still work)", async () => {
    const core = makeCore();
    await core.upsertFlag(booleanFlag());
    expect(await core.getFlag("new-dashboard")).not.toBeNull();
  });
});

describe("hooks — before (interceptor)", () => {
  test("fires before commit with the input flag", async () => {
    const rec = recorder();
    const core = makeCore(rec.hook);
    await core.upsertFlag(booleanFlag({ key: "f1" }));
    const upsert = rec.before.find((e) => e.type === "flag.upsert");
    expect(upsert).toMatchObject({
      type: "flag.upsert",
      projectKey: "default",
      environmentKey: "production",
    });
  });

  test("throwing denies the mutation — nothing commits", async () => {
    const core = makeCore({
      before: () => {
        throw new Error("policy: denied");
      },
    });
    await expect(core.upsertFlag(booleanFlag())).rejects.toThrow("policy: denied");
    expect(await core.getFlag("new-dashboard")).toBeNull();
  });

  test("before hooks run sequentially in declared order; first throw short-circuits", async () => {
    const order: string[] = [];
    const core = makeCore([
      {
        before: () => {
          order.push("a");
        },
      },
      {
        before: () => {
          order.push("b");
          throw new Error("stop");
        },
      },
      {
        before: () => {
          order.push("c");
        },
      },
    ]);
    await expect(core.upsertFlag(booleanFlag())).rejects.toThrow("stop");
    expect(order).toEqual(["a", "b"]); // "c" never runs
  });

  test("before can veto a publish — nothing is published", async () => {
    const core = makeCore({
      before: (e) => {
        if (e.type === "publish") throw new Error("change freeze");
      },
    });
    await core.upsertFlag(booleanFlag());
    await expect(core.publish({ message: "try" })).rejects.toThrow("change freeze");
    expect(await core.getActiveVersion()).toBeNull();
    expect(await core.listSnapshots()).toEqual([]);
  });
});

describe("hooks — after (observer)", () => {
  test("fires after commit with the stamped flag", async () => {
    const rec = recorder();
    const core = makeCore(rec.hook);
    await core.upsertFlag(booleanFlag({ key: "f1" }));
    const upserted = rec.after.find((e) => e.type === "flag.upserted");
    expect(upserted).toBeDefined();
    expect(upserted).toMatchObject({ type: "flag.upserted" });
    if (upserted?.type === "flag.upserted") {
      expect(upserted.flag.updatedAt).toBeTypeOf("string");
      expect(upserted.at).toBe(upserted.flag.updatedAt);
    }
  });

  test("a throwing after hook never fails the operation; onHookError is called", async () => {
    const onHookError = vi.fn();
    const err = new Error("webhook down");
    const core = makeCore(
      {
        after: () => {
          throw err;
        },
      },
      onHookError,
    );
    // Operation succeeds despite the after-hook throwing.
    const flag = await core.upsertFlag(booleanFlag());
    expect(flag.key).toBe("new-dashboard");
    expect(await core.getFlag("new-dashboard")).not.toBeNull();
    expect(onHookError).toHaveBeenCalledTimes(1);
    expect(onHookError.mock.calls[0]?.[0]).toBe(err);
  });

  test("one failing after hook does not prevent the others from running", async () => {
    const ran: string[] = [];
    const onHookError = vi.fn();
    const core = makeCore(
      [
        {
          after: () => {
            ran.push("a");
            throw new Error("boom");
          },
        },
        {
          after: () => {
            ran.push("b");
          },
        },
      ],
      onHookError,
    );
    await core.upsertFlag(booleanFlag());
    expect(ran.sort()).toEqual(["a", "b"]);
    expect(onHookError).toHaveBeenCalledTimes(1);
  });
});

describe("hooks — event coverage", () => {
  test("archive/restore fire their own events, not flag.upsert", async () => {
    const rec = recorder();
    const core = makeCore(rec.hook);
    await core.upsertFlag(booleanFlag({ key: "f1" }));

    rec.reset();
    await core.archiveFlag("f1");
    expect(rec.types()).toEqual(["flag.archive", "flag.archived"]);

    rec.reset();
    await core.restoreFlag("f1");
    expect(rec.types()).toEqual(["flag.restore", "flag.restored"]);
  });

  test("delete fires before/after and can be denied", async () => {
    const rec = recorder();
    const core = makeCore(rec.hook);
    await core.upsertFlag(booleanFlag({ key: "f1" }));
    rec.reset();
    await core.deleteFlag("f1");
    expect(rec.types()).toEqual(["flag.delete", "flag.deleted"]);

    // Deny path leaves the flag in place.
    const denyCore = makeCore({
      before: (e) => {
        if (e.type === "flag.delete") throw new Error("no");
      },
    });
    await denyCore.upsertFlag(booleanFlag({ key: "f2" }));
    await expect(denyCore.deleteFlag("f2")).rejects.toThrow("no");
    expect(await denyCore.getFlag("f2")).not.toBeNull();
  });

  test("segment upsert/delete fire events", async () => {
    const rec = recorder();
    const core = makeCore(rec.hook);
    await core.upsertSegment({ key: "beta", conditions: [] });
    await core.deleteSegment("beta");
    expect(rec.types()).toEqual([
      "segment.upsert",
      "segment.upserted",
      "segment.delete",
      "segment.deleted",
    ]);
  });

  test("publish fires published with the snapshot; rollback fires rolledback", async () => {
    const rec = recorder();
    const core = makeCore(rec.hook);
    await core.upsertFlag(booleanFlag());
    const v1 = await core.publish({ message: "first", by: { id: "alice" } });
    await core.upsertFlag(booleanFlag({ defaultVariant: "on" }));
    await core.publish({ message: "second" });
    await core.rollback({ version: v1.version, by: { id: "bob" } });

    const published = rec.after.filter((e) => e.type === "published");
    expect(published).toHaveLength(2);
    const first = published[0];
    if (first?.type === "published") {
      expect(first.snapshot.version).toBe(v1.version);
      expect(first.actor).toMatchObject({ id: "alice" });
    }

    const rolledback = rec.after.find((e) => e.type === "rolledback");
    expect(rolledback).toMatchObject({ type: "rolledback", version: v1.version });
    if (rolledback?.type === "rolledback") {
      expect(rolledback.fromVersion).toBe("v2");
      expect(rolledback.actor).toMatchObject({ id: "bob" });
    }
  });
});
