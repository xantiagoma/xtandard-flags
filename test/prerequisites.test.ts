import { describe, expect, test } from "vitest";
import { evaluateFlag } from "../src/evaluator.ts";
import { validateDraft, validatePrerequisiteGraph } from "../src/validation.ts";
import { createFlagsCore } from "../src/core.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import type { Flag } from "../src/schema.ts";
import { booleanFlag } from "./fixtures.ts";

// A boolean flag "killSwitch" and a dependent flag gated on killSwitch === "on".
const killSwitch = (enabled = true): Flag => booleanFlag({ key: "kill-switch", enabled });
const dependent = (requiredVariant = "on"): Flag =>
  booleanFlag({
    key: "feature",
    enabled: true,
    defaultVariant: "off",
    fallthrough: { variant: "on" },
    prerequisites: [{ flagKey: "kill-switch", variant: requiredVariant }],
  });

const mapOf = (...flags: Flag[]): Record<string, Flag> =>
  Object.fromEntries(flags.map((f) => [f.key, f]));

describe("prerequisites — evaluator", () => {
  test("served normally when the prerequisite resolves to the required variant", () => {
    const all = mapOf(killSwitch(true), dependent("on"));
    // kill-switch (enabled) falls through to "off" by default fixture... set it on:
    all["kill-switch"]!.fallthrough = { variant: "on" };
    all["kill-switch"]!.defaultVariant = "on";
    const r = evaluateFlag(all.feature!, { targetingKey: "u1" }, all);
    expect(r.reason).toBe("STATIC");
    expect(r.variant).toBe("on");
  });

  test("serves default with PREREQUISITE_FAILED when the prerequisite variant differs", () => {
    const ks = killSwitch(true);
    ks.fallthrough = { variant: "off" }; // resolves to "off", not the required "on"
    const all = mapOf(ks, dependent("on"));
    const r = evaluateFlag(all.feature!, { targetingKey: "u1" }, all);
    expect(r.reason).toBe("PREREQUISITE_FAILED");
    expect(r.variant).toBe("off"); // the dependent flag's own default
    expect(r.value).toBe(false);
  });

  test("a disabled prerequisite (serving its default) gates the dependent flag", () => {
    const ks = killSwitch(false); // disabled → serves defaultVariant "off"
    const all = mapOf(ks, dependent("on"));
    expect(evaluateFlag(all.feature!, { targetingKey: "u1" }, all).reason).toBe(
      "PREREQUISITE_FAILED",
    );
  });

  test("missing prerequisite flag → PREREQUISITE_FAILED (fail closed)", () => {
    const all = mapOf(dependent("on")); // no kill-switch present
    expect(evaluateFlag(all.feature!, { targetingKey: "u1" }, all).reason).toBe(
      "PREREQUISITE_FAILED",
    );
  });

  test("chains: A requires B requires C", () => {
    const c = booleanFlag({ key: "c", defaultVariant: "on", fallthrough: { variant: "on" } });
    const b = booleanFlag({
      key: "b",
      // default "off" so that if b's own prerequisite (c) fails, b serves "off"
      // and the failure propagates to a (which requires b === "on").
      defaultVariant: "off",
      fallthrough: { variant: "on" },
      prerequisites: [{ flagKey: "c", variant: "on" }],
    });
    const a = booleanFlag({
      key: "a",
      defaultVariant: "off",
      fallthrough: { variant: "on" },
      prerequisites: [{ flagKey: "b", variant: "on" }],
    });
    const all = mapOf(a, b, c);
    expect(evaluateFlag(a, { targetingKey: "u" }, all).variant).toBe("on");

    // Break the chain at C → A fails.
    c.fallthrough = { variant: "off" };
    c.defaultVariant = "off";
    expect(evaluateFlag(a, { targetingKey: "u" }, mapOf(a, b, c)).reason).toBe(
      "PREREQUISITE_FAILED",
    );
  });

  test("a runtime cycle fails closed rather than looping forever", () => {
    const a = booleanFlag({
      key: "a",
      fallthrough: { variant: "on" },
      defaultVariant: "off",
      prerequisites: [{ flagKey: "b", variant: "on" }],
    });
    const b = booleanFlag({
      key: "b",
      fallthrough: { variant: "on" },
      defaultVariant: "off",
      prerequisites: [{ flagKey: "a", variant: "on" }],
    });
    const r = evaluateFlag(a, { targetingKey: "u" }, mapOf(a, b));
    expect(r.reason).toBe("PREREQUISITE_FAILED");
  });

  test("backward compatible: no allFlags arg and no prerequisites behaves as before", () => {
    const r = evaluateFlag(booleanFlag({ fallthrough: { variant: "on" } }), { targetingKey: "u" });
    expect(r.reason).toBe("STATIC");
  });
});

describe("prerequisites — validation", () => {
  test("dangling prerequisite flag is reported", () => {
    const errs = validatePrerequisiteGraph(mapOf(dependent("on")));
    expect(errs.some((e) => /unknown prerequisite flag/.test(e.message))).toBe(true);
  });

  test("missing required variant is reported", () => {
    const errs = validatePrerequisiteGraph(mapOf(killSwitch(true), dependent("nope")));
    expect(errs.some((e) => /no variant "nope"/.test(e.message))).toBe(true);
  });

  test("a cycle is reported by validateDraft", () => {
    const a = booleanFlag({ key: "a", prerequisites: [{ flagKey: "b", variant: "on" }] });
    const b = booleanFlag({ key: "b", prerequisites: [{ flagKey: "a", variant: "on" }] });
    const result = validateDraft({
      projectKey: "default",
      environmentKey: "production",
      flags: mapOf(a, b),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /cyclic prerequisite/.test(e.message))).toBe(true);
  });

  test("a valid chain passes", () => {
    expect(validatePrerequisiteGraph(mapOf(killSwitch(true), dependent("on")))).toEqual([]);
  });
});

describe("prerequisites — core publish + evaluate", () => {
  test("publish rejects a cyclic dependency", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertFlag(
      booleanFlag({ key: "a", prerequisites: [{ flagKey: "b", variant: "on" }] }),
    );
    await core.upsertFlag(
      booleanFlag({ key: "b", prerequisites: [{ flagKey: "a", variant: "on" }] }),
    );
    await expect(core.publish()).rejects.toThrow(/cyclic/i);
  });

  test("draft evaluation resolves prerequisites across the flag map", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    await core.upsertFlag(
      booleanFlag({ key: "kill-switch", defaultVariant: "off", fallthrough: { variant: "off" } }),
    );
    await core.upsertFlag(dependent("on"));
    const res = await core.evaluate({
      context: { targetingKey: "u" },
      flagKey: "feature",
      source: "draft",
    });
    expect(res[0]!.reason).toBe("PREREQUISITE_FAILED");
  });
});
