import { describe, expect, test } from "vitest";
import {
  booleanFlag,
  createTestPanel,
  publishFlags,
  variantFlag,
} from "../src/testing.ts";

describe("createTestPanel", () => {
  test("creates a core with separate source/runtime stores by default", () => {
    const panel = createTestPanel();
    expect(panel.core).toBeDefined();
    expect(panel.sourceStorage).not.toBe(panel.runtimeStorage);
  });

  test("sharedStorage uses one store for both roles", () => {
    const panel = createTestPanel({ sharedStorage: true });
    expect(panel.sourceStorage).toBe(panel.runtimeStorage);
  });

  test("readonly flag is threaded into the core", () => {
    const panel = createTestPanel({ readonly: true });
    expect(panel.core.options.readonly).toBe(true);
  });
});

describe("booleanFlag builder", () => {
  test("defaults to off / enabled", () => {
    const flag = booleanFlag("f");
    expect(flag.type).toBe("boolean");
    expect(flag.enabled).toBe(true);
    expect(flag.defaultVariant).toBe("off");
    expect(flag.fallthrough).toEqual({ variant: "off" });
  });

  test("default true flips to on", () => {
    const flag = booleanFlag("f", { default: true });
    expect(flag.defaultVariant).toBe("on");
    expect(flag.fallthrough).toEqual({ variant: "on" });
  });

  test("honours enabled/fallthrough/rules/overrides config", () => {
    const flag = booleanFlag("f", {
      enabled: false,
      fallthrough: { variant: "on" },
      rules: [{ id: "r1", conditions: [], serve: { variant: "on" } }],
      overrides: [{ targetingKey: "u1", variant: "on" }],
    });
    expect(flag.enabled).toBe(false);
    expect(flag.fallthrough).toEqual({ variant: "on" });
    expect(flag.rules?.length).toBe(1);
    expect(flag.overrides?.length).toBe(1);
  });
});

describe("variantFlag builder", () => {
  test("builds a string flag from a variant map", () => {
    const flag = variantFlag("layout", "string", {
      variants: { control: "v1", treatment: "v2" },
      default: "control",
    });
    expect(flag.type).toBe("string");
    expect(flag.defaultVariant).toBe("control");
    expect(flag.variants.control).toEqual({ value: "v1" });
    expect(flag.fallthrough).toEqual({ variant: "control" });
  });

  test("builds a number flag", () => {
    const flag = variantFlag("limit", "number", {
      variants: { low: 10, high: 100 },
      default: "low",
    });
    expect(flag.type).toBe("number");
    expect(flag.variants.high).toEqual({ value: 100 });
  });

  test("builds a json flag and honours enabled/fallthrough", () => {
    const flag = variantFlag("cfg", "json", {
      variants: { a: { x: 1 }, b: { x: 2 } },
      default: "a",
      enabled: false,
      fallthrough: { variant: "b" },
    });
    expect(flag.type).toBe("json");
    expect(flag.enabled).toBe(false);
    expect(flag.fallthrough).toEqual({ variant: "b" });
    expect(flag.variants.a).toEqual({ value: { x: 1 } });
  });
});

describe("publishFlags", () => {
  test("upserts then publishes, returning the version", async () => {
    const { core } = createTestPanel();
    const version = await publishFlags(core, [
      booleanFlag("a"),
      booleanFlag("b", { default: true }),
    ]);
    expect(version).toBe("v1");
    const active = await core.getActiveSnapshot();
    expect(Object.keys(active!.flags).sort()).toEqual(["a", "b"]);
  });

  test("evaluates a published flag against the active snapshot", async () => {
    const { core } = createTestPanel();
    await publishFlags(core, [booleanFlag("feature", { default: true })]);
    const [result] = await core.evaluate({
      context: { targetingKey: "u1" },
      source: "active",
    });
    expect(result?.value).toBe(true);
  });
});
