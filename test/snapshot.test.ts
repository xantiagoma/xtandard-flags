import { describe, expect, test } from "vitest";
import { compileDraft, nextVersion, SnapshotStore } from "../src/snapshot.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { draft, themeFlag } from "./fixtures.ts";

describe("nextVersion", () => {
  test("starts at v1", () => {
    expect(nextVersion([])).toBe("v1");
  });
  test("increments past the max", () => {
    expect(nextVersion(["v1", "v2", "v10"])).toBe("v11");
  });
  test("ignores malformed versions", () => {
    expect(nextVersion(["v3", "draft", "vX"])).toBe("v4");
  });
});

describe("compileDraft", () => {
  test("produces a versioned, decoupled snapshot", () => {
    const d = draft([themeFlag()]);
    const snap = compileDraft(d, { version: "v1", createdBy: { id: "u1", email: "a@b.c" } });
    expect(snap.schemaVersion).toBe(1);
    expect(snap.version).toBe("v1");
    expect(snap.projectKey).toBe("default");
    expect(snap.createdBy?.id).toBe("u1");
    // Mutating the source draft must not affect the snapshot.
    d.flags.theme!.enabled = false;
    expect(snap.flags.theme!.enabled).toBe(true);
  });
});

describe("SnapshotStore", () => {
  test("publish writes a snapshot, sets active_version, and audits", async () => {
    const store = new SnapshotStore(createMemoryStorage());
    const snap = await store.publish(draft([themeFlag()]), { createdBy: { id: "u1" } });
    expect(snap.version).toBe("v1");
    expect(await store.getActiveVersion("default", "production")).toBe("v1");
    const active = await store.getActiveSnapshot("default", "production");
    expect(active?.flags.theme).toBeDefined();
    const audit = await store.listAudit("default", "production");
    expect(audit[0]).toMatchObject({ version: "v1", action: "publish" });
  });

  test("successive publishes increment versions", async () => {
    const store = new SnapshotStore(createMemoryStorage());
    const d = draft([themeFlag()]);
    await store.publish(d);
    await store.publish(d);
    const third = await store.publish(d);
    expect(third.version).toBe("v3");
    expect(await store.listVersions("default", "production")).toEqual(["v3", "v2", "v1"]);
  });

  test("rollback flips active_version to an earlier snapshot", async () => {
    const store = new SnapshotStore(createMemoryStorage());
    const d = draft([themeFlag()]);
    await store.publish(d); // v1
    await store.publish(d); // v2
    await store.rollback("default", "production", "v1", { by: { id: "admin" } });
    expect(await store.getActiveVersion("default", "production")).toBe("v1");
    const audit = await store.listAudit("default", "production");
    expect(audit[0]).toMatchObject({ action: "rollback", version: "v1", fromVersion: "v2" });
  });

  test("audit is append-only: rollback to v1 keeps v1's original publish entry", async () => {
    const store = new SnapshotStore(createMemoryStorage());
    const d = draft([themeFlag()]);
    await store.publish(d); // v1 publish
    await store.publish(d); // v2 publish
    await store.rollback("default", "production", "v1"); // rollback → v1
    const audit = await store.listAudit("default", "production");
    // Three immutable events, newest first — the v1 publish is NOT overwritten.
    expect(audit.map((e) => `${e.action}:${e.version}`)).toEqual([
      "rollback:v1",
      "publish:v2",
      "publish:v1",
    ]);
  });

  test("rollback to a missing version throws", async () => {
    const store = new SnapshotStore(createMemoryStorage());
    await store.publish(draft([themeFlag()]));
    await expect(store.rollback("default", "production", "v99")).rejects.toThrow(/not found/);
  });

  test("getActiveSnapshot returns null when nothing is published", async () => {
    const store = new SnapshotStore(createMemoryStorage());
    expect(await store.getActiveSnapshot("default", "production")).toBeNull();
  });
});
