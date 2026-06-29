import { describe, expect, test } from "vitest";
import { createFlagsCore, NotFoundError, ReadonlyError } from "../src/core.ts";
import { compileDraft } from "../src/snapshot.ts";
import { validateFlag } from "../src/validation.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { booleanFlag, themeFlag, draft as makeDraft } from "./fixtures.ts";

const makeCore = (readonly = false) =>
  createFlagsCore({ sourceStorage: createMemoryStorage(), readonly });

describe("archiving — schema & validation", () => {
  test("validateFlag accepts archivedAt (string or null)", () => {
    expect(validateFlag(booleanFlag({ archivedAt: new Date().toISOString() })).valid).toBe(true);
    expect(validateFlag(booleanFlag({ archivedAt: null })).valid).toBe(true);
    expect(validateFlag(booleanFlag()).valid).toBe(true);
  });

  test("validateFlag rejects a non-string archivedAt", () => {
    expect(validateFlag(booleanFlag({ archivedAt: 123 as unknown as string })).valid).toBe(false);
  });
});

describe("archiving — snapshot compilation", () => {
  test("compileDraft excludes archived flags from the snapshot", () => {
    const d = makeDraft([booleanFlag(), themeFlag({ archivedAt: "2026-06-29T00:00:00.000Z" })]);
    const snap = compileDraft(d, { version: "v1" });
    expect(Object.keys(snap.flags)).toEqual(["new-dashboard"]);
    expect(snap.flags.theme).toBeUndefined();
  });

  test("a flag with archivedAt: null is kept in the snapshot", () => {
    const d = makeDraft([booleanFlag({ archivedAt: null })]);
    const snap = compileDraft(d, { version: "v1" });
    expect(snap.flags["new-dashboard"]).toBeDefined();
  });
});

describe("archiving — core", () => {
  test("archiveFlag stamps archivedAt and restoreFlag clears it", async () => {
    const core = makeCore();
    await core.upsertFlag(themeFlag());

    const archived = await core.archiveFlag("theme");
    expect(typeof archived.archivedAt).toBe("string");

    const restored = await core.restoreFlag("theme");
    expect(restored.archivedAt).toBeUndefined();
  });

  test("archived flags stay in the draft but leave the published snapshot", async () => {
    const core = makeCore();
    await core.upsertFlag(booleanFlag());
    await core.upsertFlag(themeFlag());
    await core.archiveFlag("theme");

    // Still present in the working draft (for restore/history)…
    const flags = await core.listFlags();
    expect(flags.map((f) => f.key).sort()).toEqual(["new-dashboard", "theme"]);

    // …but excluded once published.
    const snap = await core.publish();
    expect(Object.keys(snap.flags)).toEqual(["new-dashboard"]);
  });

  test("archiveFlag / restoreFlag throw NotFoundError for an unknown flag", async () => {
    const core = makeCore();
    await expect(core.archiveFlag("ghost")).rejects.toBeInstanceOf(NotFoundError);
    await expect(core.restoreFlag("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("archiveFlag / restoreFlag are blocked in readonly mode", async () => {
    const core = makeCore(true);
    await expect(core.archiveFlag("theme")).rejects.toBeInstanceOf(ReadonlyError);
    await expect(core.restoreFlag("theme")).rejects.toBeInstanceOf(ReadonlyError);
  });

  test("evaluating the active snapshot ignores archived flags", async () => {
    const core = makeCore();
    await core.upsertFlag(booleanFlag());
    await core.upsertFlag(themeFlag());
    await core.archiveFlag("theme");
    await core.publish();

    const results = await core.evaluate({ context: { targetingKey: "u1" }, source: "active" });
    expect(results.map((r) => r.key)).toEqual(["new-dashboard"]);
  });
});

describe("archiving — HTTP routes", () => {
  const BASE = "/api/projects/default/environments/production";
  const handler = () => createFetchHandler({ sourceStorage: createMemoryStorage() });
  const req = (method: string, path: string) => new Request(`http://localhost${path}`, { method });

  test("POST .../archive then .../restore", async () => {
    const { fetch } = handler();
    // seed a flag
    await fetch(
      new Request(`http://localhost${BASE}/flags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(themeFlag()),
      }),
    );

    const archived = await fetch(req("POST", `${BASE}/flags/theme/archive`));
    expect(archived.status).toBe(200);
    expect(typeof (await archived.json()).archivedAt).toBe("string");

    const restored = await fetch(req("POST", `${BASE}/flags/theme/restore`));
    expect(restored.status).toBe(200);
    expect((await restored.json()).archivedAt).toBeUndefined();
  });

  test("POST .../archive on a missing flag returns 404", async () => {
    const { fetch } = handler();
    const res = await fetch(req("POST", `${BASE}/flags/ghost/archive`));
    expect(res.status).toBe(404);
  });
});
