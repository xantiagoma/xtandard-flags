import { describe, expect, test } from "vitest";
import { validateFlag } from "../src/validation.ts";
import { createFlagsCore } from "../src/core.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, themeFlag } from "./fixtures.ts";

describe("owner — validation", () => {
  test("accepts a full owner", () => {
    const r = validateFlag(
      booleanFlag({ owner: { name: "Ada", email: "ada@example.com", team: "Core" } }),
    );
    expect(r.valid).toBe(true);
  });

  test("accepts a name-only owner", () => {
    expect(validateFlag(booleanFlag({ owner: { name: "Ada" } })).valid).toBe(true);
  });

  test("rejects an owner without a name", () => {
    const flag = { ...booleanFlag(), owner: { email: "x@y.z" } };
    expect(validateFlag(flag).valid).toBe(false);
  });

  test("rejects an empty owner name", () => {
    expect(validateFlag(booleanFlag({ owner: { name: "" } })).valid).toBe(false);
  });
});

describe("owner — core round-trip", () => {
  test("owner survives upsert + publish into the snapshot", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertFlag(themeFlag({ owner: { name: "Grace", team: "Payments" } }));
    const snap = await core.publish();
    expect(snap.flags.theme?.owner).toEqual({ name: "Grace", team: "Payments" });
  });
});
