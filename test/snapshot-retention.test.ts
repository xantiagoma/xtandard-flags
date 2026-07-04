import { describe, expect, test } from "vitest";
import { createFlagsCore, SnapshotProtectedError, NotFoundError } from "../src/core.ts";
import type { RetentionOptions } from "../src/core.ts";
import type { AfterEvent, BeforeEvent, FlagsHooks } from "../src/hooks/contract.ts";
import { HookDeniedError } from "../src/hooks/contract.ts";
import { SnapshotStore } from "../src/snapshot.ts";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag } from "./fixtures.ts";

/** Core over separate source/runtime memory stores, so both planes are observable. */
function makeCore(opts: { retention?: RetentionOptions; hooks?: FlagsHooks } = {}) {
  const sourceStorage = createMemoryStorage();
  const runtimeStorage = createMemoryStorage();
  const core = createFlagsCore({ sourceStorage, runtimeStorage, ...opts });
  return {
    core,
    source: new SnapshotStore(sourceStorage),
    runtime: new SnapshotStore(runtimeStorage),
  };
}

/** Publish `n` versions (each with a distinct flag tweak so drafts differ). */
async function publishN(core: ReturnType<typeof makeCore>["core"], n: number) {
  for (let i = 1; i <= n; i++) {
    await core.upsertFlag(booleanFlag({ description: `rev ${i}` }));
    await core.publish({ message: `publish ${i}` });
  }
}

describe("deleteSnapshot", () => {
  test("removes the payload from BOTH planes and appends a delete audit entry", async () => {
    const { core, source, runtime } = makeCore();
    await publishN(core, 3);
    await core.deleteSnapshot({ version: "v1", by: { id: "alice" } });

    expect(await source.getSnapshot("default", "production", "v1")).toBeNull();
    expect(await runtime.getSnapshot("default", "production", "v1")).toBeNull();
    // v2/v3 untouched.
    expect(await source.getSnapshot("default", "production", "v2")).not.toBeNull();

    const audit = await core.listAudit();
    expect(audit[0]).toMatchObject({ action: "delete", version: "v1", by: { id: "alice" } });
  });

  test("guards: active and latest are protected; missing is NotFound", async () => {
    const { core } = makeCore();
    await publishN(core, 3); // active = latest = v3
    await expect(core.deleteSnapshot({ version: "v3" })).rejects.toBeInstanceOf(
      SnapshotProtectedError,
    );
    await core.rollback({ version: "v1" }); // active = v1, latest = v3
    await expect(core.deleteSnapshot({ version: "v1" })).rejects.toThrow(/active/);
    await expect(core.deleteSnapshot({ version: "v3" })).rejects.toThrow(/latest/);
    await expect(core.deleteSnapshot({ version: "v9" })).rejects.toBeInstanceOf(NotFoundError);
    // v2 is neither → deletable.
    await core.deleteSnapshot({ version: "v2" });
  });

  test("never reuses a deleted version number", async () => {
    const { core } = makeCore();
    await publishN(core, 3);
    await core.deleteSnapshot({ version: "v2" });
    await core.upsertFlag(booleanFlag({ description: "rev 4" }));
    const next = await core.publish({ message: "after delete" });
    expect(next.version).toBe("v4"); // not v2
  });

  test("fires before (vetoable) and after (with the full snapshot payload)", async () => {
    const before: BeforeEvent[] = [];
    const after: AfterEvent[] = [];
    const { core } = makeCore({
      hooks: {
        before: (e) => {
          before.push(e);
        },
        after: (e) => {
          after.push(e);
        },
      },
    });
    await publishN(core, 2);
    await core.deleteSnapshot({ version: "v1" });

    expect(before.some((e) => e.type === "snapshot.delete")).toBe(true);
    const deleted = after.find((e) => e.type === "snapshot.deleted");
    expect(deleted).toMatchObject({ type: "snapshot.deleted", version: "v1", pruned: false });
    if (deleted?.type === "snapshot.deleted") {
      expect(deleted.snapshot.version).toBe("v1"); // full payload for offloading
      expect(deleted.snapshot.flags["new-dashboard"]).toBeDefined();
    }
  });

  test("a before hook can veto the deletion", async () => {
    const { core, source } = makeCore({
      hooks: {
        before: (e) => {
          if (e.type === "snapshot.delete") throw new HookDeniedError("keep history");
        },
      },
    });
    await publishN(core, 2);
    await expect(core.deleteSnapshot({ version: "v1" })).rejects.toThrow("keep history");
    expect(await source.getSnapshot("default", "production", "v1")).not.toBeNull();
  });
});

describe("retention — snapshots", () => {
  test("keepLast prunes beyond N (latest + active always kept)", async () => {
    const pruned: string[] = [];
    const { core } = makeCore({
      retention: { snapshots: { keepLast: 2 } },
      hooks: {
        after: (e) => {
          if (e.type === "snapshot.deleted" && e.pruned) pruned.push(e.version);
        },
      },
    });
    await publishN(core, 5);
    expect(await core.listSnapshots()).toEqual(["v5", "v4"]);
    expect(pruned.sort()).toEqual(["v1", "v2", "v3"]);
  });

  test("rollback then publish prunes the now-inactive versions cleanly", async () => {
    // keepLast 2 so seeding survives; retention runs only on publish (rollback
    // never prunes — after a publish the new version is both active and latest,
    // so the active-guard in applyRetention is defense-in-depth).
    const { core } = makeCore({ retention: { snapshots: { keepLast: 2 } } });
    await publishN(core, 2);
    await core.rollback({ version: "v1" }); // active = v1; nothing pruned by rollback
    expect(await core.listSnapshots()).toEqual(["v2", "v1"]);
    await core.upsertFlag(booleanFlag({ description: "rev 3" }));
    await core.publish({ message: "publish 3" }); // v3 active+latest; keepLast 2 → v1 pruned
    expect(await core.listSnapshots()).toEqual(["v3", "v2"]);
    expect((await core.getActiveVersion()) ?? "").toBe("v3");
  });

  test("maxAge prunes older snapshots; union with keepLast keeps either", async () => {
    const { core, source, runtime } = makeCore({
      retention: { snapshots: { keepLast: 2, maxAge: { value: 1, unit: "hours" } } },
    });
    // Seed two OLD snapshots directly (as a long-running install would have).
    const old = new Date(Date.now() - 3 * 3_600_000).toISOString();
    for (const version of ["v1", "v2"]) {
      const snap = {
        schemaVersion: 1,
        version,
        projectKey: "default",
        environmentKey: "production",
        createdAt: old,
        createdBy: null,
        flags: {},
      };
      await source.putSnapshot(snap);
      await runtime.putSnapshot(snap);
    }
    await source.setActiveVersion("default", "production", "v2");

    await core.upsertFlag(booleanFlag());
    await core.publish({ message: "publish 3" }); // v3 triggers retention
    // v3 latest; v2 old but within keepLast=2 (union keeps it); v1 old + beyond count → pruned.
    expect(await core.listSnapshots()).toEqual(["v3", "v2"]);
  });
});

describe("retention — audit", () => {
  test("keepLast trims the audit log and surfaces removed entries for offload", async () => {
    const events: AfterEvent[] = [];
    const { core } = makeCore({
      retention: { audit: { keepLast: 2 } },
      hooks: {
        after: (e) => {
          events.push(e);
        },
      },
    });
    await publishN(core, 4);
    const audit = await core.listAudit();
    expect(audit).toHaveLength(2);
    expect(audit[0]?.message).toBe("publish 4");

    const prunes = events.filter((e) => e.type === "audit.pruned");
    expect(prunes.length).toBeGreaterThan(0);
    const removed = prunes.flatMap((e) => (e.type === "audit.pruned" ? e.entries : []));
    expect(removed.some((e) => e.message === "publish 1")).toBe(true);
    // Payload present → offloadable.
    expect(removed.every((e) => typeof e.at === "string" && e.action === "publish")).toBe(true);
  });

  test("no retention config → nothing pruned", async () => {
    const { core } = makeCore();
    await publishN(core, 4);
    expect(await core.listSnapshots()).toHaveLength(4);
    expect(await core.listAudit()).toHaveLength(4);
  });
});

describe("DELETE /snapshots/:version (API)", () => {
  const BASE = "/api/projects/default/environments/production";
  const req = (method: string, path: string, body?: unknown) =>
    new Request(`http://localhost${path}`, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  async function panel() {
    const handler = createFetchHandler({ sourceStorage: createMemoryStorage() });
    await publishN(handler.core, 3);
    return handler;
  }

  test("deletes an old snapshot (204) and it is gone", async () => {
    const { fetch } = await panel();
    const res = await fetch(req("DELETE", `${BASE}/snapshots/v1`));
    expect(res.status).toBe(204);
    expect((await fetch(req("GET", `${BASE}/snapshots/v1`))).status).toBe(404);
  });

  test("active/latest → 409 SNAPSHOT_PROTECTED; missing → 404", async () => {
    const { fetch } = await panel();
    const res = await fetch(req("DELETE", `${BASE}/snapshots/v3`));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "SNAPSHOT_PROTECTED" });
    expect((await fetch(req("DELETE", `${BASE}/snapshots/v9`))).status).toBe(404);
  });
});
