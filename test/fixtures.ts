import type { Draft, Flag } from "../src/schema.ts";

/** A boolean flag: on/off variants, default off. */
export const booleanFlag = (overrides: Partial<Flag> = {}): Flag => ({
  key: "new-dashboard",
  type: "boolean",
  enabled: true,
  defaultVariant: "off",
  variants: { on: { value: true }, off: { value: false } },
  fallthrough: { variant: "off" },
  ...overrides,
});

/** A string flag with three variants. */
export const themeFlag = (overrides: Partial<Flag> = {}): Flag => ({
  key: "theme",
  type: "string",
  enabled: true,
  defaultVariant: "normal",
  variants: {
    normal: { value: "normal" },
    xmas: { value: "xmas" },
    halloween: { value: "halloween" },
  },
  fallthrough: { variant: "normal" },
  ...overrides,
});

/** A number flag. */
export const numberFlag = (overrides: Partial<Flag> = {}): Flag => ({
  key: "max-items",
  type: "number",
  enabled: true,
  defaultVariant: "low",
  variants: { low: { value: 10 }, high: { value: 100 } },
  fallthrough: { variant: "low" },
  ...overrides,
});

/** A json flag. */
export const jsonFlag = (overrides: Partial<Flag> = {}): Flag => ({
  key: "config",
  type: "json",
  enabled: true,
  defaultVariant: "default",
  variants: {
    default: { value: { color: "blue", limit: 5 } },
    promo: { value: { color: "red", limit: 50 } },
  },
  fallthrough: { variant: "default" },
  ...overrides,
});

export const draft = (flags: Flag[]): Draft => ({
  projectKey: "default",
  environmentKey: "production",
  flags: Object.fromEntries(flags.map((f) => [f.key, f])),
});
