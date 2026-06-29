import { describe, expect, test } from "vitest";
import { createFlagsCore, NotFoundError, ReadonlyError } from "../src/core.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, themeFlag } from "./fixtures.ts";

const makeCore = (readonly = false) =>
  createFlagsCore({ sourceStorage: createMemoryStorage(), readonly });

describe("core — projects", () => {
  test("createProject + getProject + listProjects", async () => {
    const core = makeCore();
    const meta = await core.createProject({ key: "billing", name: "Billing" });
    expect(meta.key).toBe("billing");
    expect(meta.name).toBe("Billing");
    expect(await core.getProject("billing")).toMatchObject({ key: "billing" });
    const list = await core.listProjects();
    expect(list.some((p) => p.key === "billing")).toBe(true);
    // default is auto-ensured by listProjects
    expect(list.some((p) => p.key === "default")).toBe(true);
  });

  test("getProject returns null for an unknown project", async () => {
    const core = makeCore();
    expect(await core.getProject("nope")).toBeNull();
  });
});

describe("core — environments", () => {
  test("createEnvironment + listEnvironments", async () => {
    const core = makeCore();
    const meta = await core.createEnvironment("default", { key: "staging", name: "Staging" });
    expect(meta.key).toBe("staging");
    const envs = await core.listEnvironments("default");
    expect(envs.some((e) => e.key === "staging")).toBe(true);
    expect(envs.some((e) => e.key === "production")).toBe(true);
  });
});

describe("core — draft & flags", () => {
  test("replaceDraft validates and stores the draft", async () => {
    const core = makeCore();
    const draft = await core.replaceDraft({
      projectKey: "default",
      environmentKey: "production",
      flags: { theme: themeFlag() },
    });
    expect(Object.keys(draft.flags)).toEqual(["theme"]);
  });

  test("deleteFlag removes a present flag", async () => {
    const core = makeCore();
    await core.upsertFlag(themeFlag());
    await core.deleteFlag("theme");
    expect(await core.getFlag("theme")).toBeNull();
  });

  test("deleteFlag of a missing flag throws NotFoundError", async () => {
    const core = makeCore();
    await expect(core.deleteFlag("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("listFlags returns the draft's flags", async () => {
    const core = makeCore();
    await core.upsertFlag(themeFlag());
    await core.upsertFlag(booleanFlag());
    expect((await core.listFlags()).length).toBe(2);
  });
});

describe("core — snapshots & history", () => {
  test("listSnapshotSummaries surfaces version + message + author", async () => {
    const core = makeCore();
    await core.upsertFlag(themeFlag());
    await core.publish({ message: "first", by: { id: "ci", name: "CI", email: "ci@x.com" } });
    const summaries = await core.listSnapshotSummaries();
    expect(summaries.length).toBe(1);
    expect(summaries[0]).toMatchObject({ version: "v1", message: "first", by: "ci@x.com" });
    expect(summaries[0]!.publishedAt).toBeDefined();
  });

  test("listSnapshots returns version strings", async () => {
    const core = makeCore();
    await core.upsertFlag(themeFlag());
    await core.publish();
    expect(await core.listSnapshots()).toEqual(["v1"]);
  });

  test("rollback to a missing version throws NotFoundError", async () => {
    const core = makeCore();
    await expect(core.rollback({ version: "v9" })).rejects.toBeInstanceOf(NotFoundError);
  });

  test("getActiveVersion reflects the latest publish", async () => {
    const core = makeCore();
    await core.upsertFlag(themeFlag());
    await core.publish();
    expect(await core.getActiveVersion()).toBe("v1");
  });
});

describe("core — readonly mode", () => {
  test("every mutating op throws ReadonlyError", async () => {
    const core = makeCore(true);
    await expect(core.createProject({ key: "p" })).rejects.toBeInstanceOf(ReadonlyError);
    await expect(core.createEnvironment("default", { key: "e" })).rejects.toBeInstanceOf(
      ReadonlyError,
    );
    await expect(core.upsertFlag(themeFlag())).rejects.toBeInstanceOf(ReadonlyError);
    await expect(core.deleteFlag("theme")).rejects.toBeInstanceOf(ReadonlyError);
    await expect(
      core.replaceDraft({ projectKey: "default", environmentKey: "production", flags: {} }),
    ).rejects.toBeInstanceOf(ReadonlyError);
    await expect(core.publish()).rejects.toBeInstanceOf(ReadonlyError);
    await expect(core.rollback({ version: "v1" })).rejects.toBeInstanceOf(ReadonlyError);
  });

  test("reads still work in readonly mode", async () => {
    const core = makeCore(true);
    expect(await core.listProjects()).toBeDefined();
    expect(await core.getDraft()).toMatchObject({ flags: {} });
  });
});

describe("core — runtime store defaults to source", () => {
  test("omitting runtimeStorage reuses sourceStorage", () => {
    const source = createMemoryStorage();
    const core = createFlagsCore({ sourceStorage: source });
    expect(core.options.runtimeStorage).toBe(source);
  });
});
