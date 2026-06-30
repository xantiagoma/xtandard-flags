import { describe, expect, test } from "vitest";
import { createFlagsCore } from "../src/core.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { DraftValidationError } from "../src/validation.ts";
import type { Segment } from "../src/schema.ts";
import { booleanFlag, themeFlag } from "./fixtures.ts";

const newCore = () => createFlagsCore({ sourceStorage: createMemoryStorage() });

describe("importDraft", () => {
  test("imports flags into an empty draft, ready to publish", async () => {
    const core = newCore();
    const f = booleanFlag();
    const result = await core.importDraft({ flags: { [f.key]: f } });

    expect(Object.keys(result.flags)).toEqual([f.key]);
    expect((await core.diffDraft()).changed).toBe(true);

    await core.publish();
    const active = await core.getActiveSnapshot();
    expect(active?.flags[f.key]?.type).toBe("boolean");
  });

  test("replaces the existing draft wholesale", async () => {
    const core = newCore();
    await core.upsertFlag(booleanFlag());
    const t = themeFlag();
    const result = await core.importDraft({ flags: { [t.key]: t } });

    expect(Object.keys(result.flags)).toEqual([t.key]);
    expect(await core.getFlag(booleanFlag().key)).toBeNull();
  });

  test("imports segments alongside flags", async () => {
    const core = newCore();
    const f = booleanFlag();
    const seg: Segment = {
      key: "beta-users",
      name: "Beta users",
      conditions: [{ attribute: "plan", operator: "in", value: ["beta"] }],
    };
    await core.importDraft({ flags: { [f.key]: f }, segments: { [seg.key]: seg } });

    const segments = await core.listSegments();
    expect(segments.map((s) => s.key)).toContain("beta-users");
  });

  test("rejects an invalid flag without writing", async () => {
    const core = newCore();
    const bad = { ...booleanFlag(), type: "nonsense" } as unknown as Parameters<
      typeof core.upsertFlag
    >[0];
    await expect(core.importDraft({ flags: { bad } })).rejects.toBeInstanceOf(DraftValidationError);
    expect(await core.listFlags()).toEqual([]);
  });

  test("rejects a flag referencing a missing segment", async () => {
    const core = newCore();
    const f = booleanFlag({
      enabled: true,
      rules: [
        {
          id: "r1",
          conditions: [{ attribute: "_", operator: "inSegment", value: "ghost" }],
          serve: { variant: "on" },
        },
      ],
    });
    await expect(core.importDraft({ flags: { [f.key]: f } })).rejects.toBeInstanceOf(
      DraftValidationError,
    );
  });
});
