/**
 * Test helpers for `@xtandard/flags` consumers and the package's own suite.
 * Spin up an in-memory panel, build flags fluently, and publish snapshots
 * without any external storage.
 *
 * @module
 */

import { createFlagsCore, type FlagsCore } from "./core.ts";
import { createMemoryStorage } from "./storage/memory.ts";
import type { FlagsStorage } from "./storage/contract.ts";
import type { Flag, JsonValue, Serve } from "./schema.ts";

/** An in-memory panel: a core plus its source/runtime stores. */
export interface TestPanel {
  core: FlagsCore;
  sourceStorage: FlagsStorage;
  runtimeStorage: FlagsStorage;
}

/**
 * Create an in-memory {@link FlagsCore} with separate source/runtime stores.
 *
 * @example
 * ```ts
 * import { createTestPanel, booleanFlag, publishFlags } from "@xtandard/flags/testing";
 *
 * const { core } = createTestPanel();
 * await publishFlags(core, [booleanFlag("my-feature", { default: true })]);
 *
 * const [result] = await core.evaluate({
 *   context: { targetingKey: "user-1" },
 *   source: "active",
 * });
 * console.log(result?.value); // true
 * ```
 */
export function createTestPanel(
  options: { readonly?: boolean; sharedStorage?: boolean } = {},
): TestPanel {
  const sourceStorage = createMemoryStorage();
  const runtimeStorage = options.sharedStorage ? sourceStorage : createMemoryStorage();
  const core = createFlagsCore({ sourceStorage, runtimeStorage, readonly: options.readonly });
  return { core, sourceStorage, runtimeStorage };
}

/**
 * Build a boolean flag (variants `on`/`off`).
 *
 * @example
 * ```ts
 * import { booleanFlag } from "@xtandard/flags/testing";
 *
 * const flag = booleanFlag("dark-mode", { default: true });
 * // flag.type === "boolean", flag.defaultVariant === "on"
 * ```
 */
export function booleanFlag(
  key: string,
  config: {
    enabled?: boolean;
    default?: boolean;
    fallthrough?: Serve;
    rules?: Flag["rules"];
    overrides?: Flag["overrides"];
  } = {},
): Flag {
  const def = config.default ?? false;
  return {
    key,
    type: "boolean",
    enabled: config.enabled ?? true,
    defaultVariant: def ? "on" : "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: config.fallthrough ?? { variant: def ? "on" : "off" },
    rules: config.rules,
    overrides: config.overrides,
  };
}

/**
 * Build a string/number/json flag from a variant map.
 *
 * @example
 * ```ts
 * import { variantFlag } from "@xtandard/flags/testing";
 *
 * const flag = variantFlag("checkout-layout", "string", {
 *   variants: { control: "v1", treatment: "v2" },
 *   default: "control",
 * });
 * // flag.type === "string", flag.defaultVariant === "control"
 * ```
 */
export function variantFlag<T extends FlagBuildType>(
  key: string,
  type: T,
  config: {
    variants: Record<string, FlagBuildValue<T>>;
    default: string;
    enabled?: boolean;
    fallthrough?: Serve;
    rules?: Flag["rules"];
    overrides?: Flag["overrides"];
  },
): Flag {
  return {
    key,
    type,
    enabled: config.enabled ?? true,
    defaultVariant: config.default,
    variants: Object.fromEntries(
      Object.entries(config.variants).map(([k, v]) => [k, { value: v as JsonValue }]),
    ),
    fallthrough: config.fallthrough ?? { variant: config.default },
    rules: config.rules,
    overrides: config.overrides,
  };
}

type FlagBuildType = "string" | "number" | "json";
type FlagBuildValue<T extends FlagBuildType> = T extends "string"
  ? string
  : T extends "number"
    ? number
    : JsonValue;

/**
 * Upsert flags into the draft and publish a snapshot in one call. Returns the version.
 *
 * @example
 * ```ts
 * import { createTestPanel, booleanFlag, publishFlags } from "@xtandard/flags/testing";
 *
 * const { core } = createTestPanel();
 * const version = await publishFlags(core, [
 *   booleanFlag("feature-a"),
 *   booleanFlag("feature-b", { default: true }),
 * ]);
 * console.log(version); // "v1"
 * ```
 */
export async function publishFlags(core: FlagsCore, flags: Flag[]): Promise<string> {
  for (const flag of flags) await core.upsertFlag(flag);
  const snapshot = await core.publish();
  return snapshot.version;
}

export { createMemoryStorage } from "./storage/memory.ts";
