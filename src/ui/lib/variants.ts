import type { Flag, Serve, Variant } from "../types.ts";

/**
 * Rename a variant key within a flag, cascading the change to every in-flag
 * reference — `defaultVariant`, rule/fallthrough serves (including split legs),
 * and overrides — so no dangling "unknown variant" references are produced.
 * Variant order is preserved.
 *
 * Returns the updated flag, or `null` if the rename is a no-op-invalid case:
 * an empty new key or one that collides with an existing variant.
 */
export function renameVariantInFlag(flag: Flag, oldKey: string, newKey: string): Flag | null {
  if (newKey === oldKey) return flag;
  if (!newKey || newKey in flag.variants) return null;

  const remap = (k: string) => (k === oldKey ? newKey : k);
  const remapServe = (s: Serve): Serve =>
    "split" in s
      ? { split: s.split.map((leg) => ({ ...leg, variant: remap(leg.variant) })) }
      : { variant: remap(s.variant) };

  const variants: Record<string, Variant> = {};
  for (const [k, v] of Object.entries(flag.variants)) variants[remap(k)] = v;

  return {
    ...flag,
    variants,
    defaultVariant: remap(flag.defaultVariant),
    fallthrough: remapServe(flag.fallthrough),
    rules: flag.rules?.map((r) => ({ ...r, serve: remapServe(r.serve) })),
    overrides: flag.overrides?.map((o) => (o.variant === oldKey ? { ...o, variant: newKey } : o)),
  };
}
