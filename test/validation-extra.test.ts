import { describe, expect, test } from "vitest";
import {
  assertValidDraft,
  DraftValidationError,
  validateFlag,
} from "../src/validation.ts";
import { booleanFlag, draft, jsonFlag, numberFlag, themeFlag } from "./fixtures.ts";

describe("validateFlag — value/type agreement per type", () => {
  test("string flag rejects a non-string value", () => {
    const r = validateFlag(themeFlag({ variants: { normal: { value: 1 } } as never }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('flag type "string"'))).toBe(true);
  });

  test("number flag rejects a non-finite value (NaN)", () => {
    const r = validateFlag(numberFlag({ variants: { low: { value: Number.NaN } } as never }));
    expect(r.valid).toBe(false);
  });

  test("number flag rejects a string value", () => {
    const r = validateFlag(numberFlag({ variants: { low: { value: "10" } } as never }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('flag type "number"'))).toBe(true);
  });

  test("boolean flag rejects a number value", () => {
    const r = validateFlag(booleanFlag({ variants: { on: { value: 1 }, off: { value: 0 } } } as never));
    expect(r.valid).toBe(false);
  });

  test("json flag accepts objects, arrays, and primitives", () => {
    expect(
      validateFlag(
        jsonFlag({
          variants: { default: { value: [1, 2, 3] }, promo: { value: "text" } },
          defaultVariant: "default",
          fallthrough: { variant: "default" },
        }),
      ).valid,
    ).toBe(true);
  });
});

describe("validateFlag — override references", () => {
  test("rejects an override referencing an unknown variant", () => {
    const r = validateFlag(themeFlag({ overrides: [{ targetingKey: "u1", variant: "ghost" }] }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes("overrides[0].variant"))).toBe(true);
  });

  test("accepts an override referencing a known variant", () => {
    expect(
      validateFlag(themeFlag({ overrides: [{ targetingKey: "u1", variant: "xmas" }] })).valid,
    ).toBe(true);
  });
});

describe("validateFlag — rules serve", () => {
  test("rejects a rule serve referencing an unknown variant", () => {
    const r = validateFlag(
      themeFlag({ rules: [{ id: "r1", conditions: [], serve: { variant: "ghost" } }] }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes("rules[0].serve"))).toBe(true);
  });
});

describe("assertValidDraft / DraftValidationError", () => {
  test("does not throw on a valid draft", () => {
    expect(() => assertValidDraft(draft([themeFlag()]))).not.toThrow();
  });

  test("throws DraftValidationError with the underlying errors", () => {
    const d = draft([themeFlag({ defaultVariant: "ghost" })]);
    let caught: unknown;
    try {
      assertValidDraft(d);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DraftValidationError);
    const err = caught as DraftValidationError;
    expect(err.name).toBe("DraftValidationError");
    expect(err.errors.length).toBeGreaterThan(0);
    expect(err.message).toContain("Draft validation failed");
  });
});
