import { describe, expect, test } from "vitest";
import { renameVariantInFlag } from "../src/ui/lib/variants.ts";
import type { Flag } from "../src/ui/types.ts";

const flag = (): Flag => ({
  key: "checkout",
  type: "string",
  enabled: true,
  defaultVariant: "control",
  variants: { control: { value: "a" }, treatment: { value: "b" } },
  fallthrough: { variant: "control" },
  overrides: [{ targetingKey: "u1", variant: "control" }],
  rules: [
    {
      id: "r1",
      conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
      serve: {
        split: [
          { variant: "control", weight: 50 },
          { variant: "treatment", weight: 50 },
        ],
      },
    },
  ],
});

describe("renameVariantInFlag", () => {
  test("cascades the rename to every in-flag reference and preserves order", () => {
    const out = renameVariantInFlag(flag(), "control", "blue")!;
    expect(Object.keys(out.variants)).toEqual(["blue", "treatment"]); // order kept
    expect(out.defaultVariant).toBe("blue");
    expect(out.fallthrough).toEqual({ variant: "blue" });
    expect(out.overrides![0]!.variant).toBe("blue");
    const split = (out.rules![0]!.serve as { split: { variant: string }[] }).split;
    expect(split.map((l) => l.variant)).toEqual(["blue", "treatment"]);
    // the value travels with the key
    expect(out.variants.blue!.value).toBe("a");
  });

  test("returns null on a duplicate key (no clobber)", () => {
    expect(renameVariantInFlag(flag(), "control", "treatment")).toBeNull();
  });

  test("returns null on an empty key", () => {
    expect(renameVariantInFlag(flag(), "control", "")).toBeNull();
  });

  test("renaming to the same key is a no-op", () => {
    const f = flag();
    expect(renameVariantInFlag(f, "control", "control")).toBe(f);
  });

  test("does not touch unrelated variants", () => {
    const out = renameVariantInFlag(flag(), "treatment", "v2")!;
    expect(out.defaultVariant).toBe("control");
    expect(Object.keys(out.variants)).toEqual(["control", "v2"]);
  });
});
