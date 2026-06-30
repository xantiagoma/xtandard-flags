import { describe, expect, test } from "vitest";
import { createFlagsCore } from "../src/core.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag } from "./fixtures.ts";

const newCore = () => createFlagsCore({ sourceStorage: createMemoryStorage() });

describe("draft diff + discard", () => {
  test("a never-published draft with a flag has changes (added)", async () => {
    const core = newCore();
    await core.upsertFlag(booleanFlag());
    const d = await core.diffDraft();
    expect(d.changed).toBe(true);
    expect(d.entries.some((e) => e.type === "added")).toBe(true);
  });

  test("after publish, the draft has no changes", async () => {
    const core = newCore();
    await core.upsertFlag(booleanFlag());
    await core.publish();
    expect((await core.diffDraft()).changed).toBe(false);
  });

  test("editing a flag after publish shows a field-level change", async () => {
    const core = newCore();
    const f = await core.upsertFlag(booleanFlag({ enabled: false }));
    await core.publish();
    await core.upsertFlag({ ...f, enabled: true });

    const d = await core.diffDraft();
    expect(d.changed).toBe(true);
    // ohash reports the changed field path under flags.<key>.enabled
    expect(d.entries.some((e) => e.type === "changed" && e.path.includes("enabled"))).toBe(true);
  });

  test("discard resets the draft to the last published state", async () => {
    const core = newCore();
    const f = await core.upsertFlag(booleanFlag({ enabled: false }));
    await core.publish();
    await core.upsertFlag({ ...f, enabled: true, description: "edited" });
    expect((await core.diffDraft()).changed).toBe(true);

    await core.discardDraft();
    expect((await core.diffDraft()).changed).toBe(false);
    const restored = await core.getFlag(f.key);
    expect(restored?.enabled).toBe(false);
    expect(restored?.description).not.toBe("edited");
  });

  test("discard with nothing ever published empties the draft", async () => {
    const core = newCore();
    await core.upsertFlag(booleanFlag());
    await core.discardDraft();
    expect(await core.listFlags()).toEqual([]);
  });

  test("archiving a flag is a publishable change, then clean after publish", async () => {
    const core = newCore();
    await core.upsertFlag(booleanFlag());
    await core.publish();
    await core.archiveFlag("new-dashboard");
    expect((await core.diffDraft()).changed).toBe(true);
    await core.publish();
    expect((await core.diffDraft()).changed).toBe(false);
  });
});
