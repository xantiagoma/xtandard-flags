import { describe, expect, test } from "vitest";
import { validateDraft, validateFlag } from "../src/validation.ts";
import { booleanFlag, draft, themeFlag } from "./fixtures.ts";

describe("validateFlag", () => {
  test("accepts a well-formed flag", () => {
    expect(validateFlag(themeFlag()).valid).toBe(true);
  });

  test("rejects a default variant not present in variants", () => {
    const r = validateFlag(themeFlag({ defaultVariant: "ghost" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.endsWith("defaultVariant"))).toBe(true);
  });

  test("rejects value/type mismatch", () => {
    const r = validateFlag(
      booleanFlag({ variants: { on: { value: "yes" }, off: { value: false } } }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("flag type"))).toBe(true);
  });

  test("rejects a serve referencing an unknown variant", () => {
    const r = validateFlag(themeFlag({ fallthrough: { variant: "ghost" } }));
    expect(r.valid).toBe(false);
  });

  test("rejects a split with no positive weight", () => {
    const r = validateFlag(
      themeFlag({ fallthrough: { split: [{ variant: "normal", weight: 0 }] } }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("positive weight"))).toBe(true);
  });

  test("rejects a split leg with an unknown variant", () => {
    const r = validateFlag(
      themeFlag({
        fallthrough: {
          split: [
            { variant: "normal", weight: 50 },
            { variant: "ghost", weight: 50 },
          ],
        },
      }),
    );
    expect(r.valid).toBe(false);
  });

  test("rejects an invalid flag key", () => {
    expect(validateFlag(themeFlag({ key: "has spaces" })).valid).toBe(false);
  });

  test("rejects a structurally invalid object", () => {
    expect(validateFlag({ nonsense: true }).valid).toBe(false);
  });
});

describe("validateDraft", () => {
  test("accepts a valid draft", () => {
    expect(validateDraft(draft([themeFlag(), booleanFlag()])).valid).toBe(true);
  });

  test("flags a key/map mismatch", () => {
    const d = draft([themeFlag()]);
    d.flags.theme!.key = "renamed";
    const r = validateDraft(d);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("does not match"))).toBe(true);
  });
});
