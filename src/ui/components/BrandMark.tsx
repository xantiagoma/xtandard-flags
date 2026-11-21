/// <reference path="../assets.d.ts" />
import symbolSvg from "../public/symbol.svg?raw";
import symbolLightSvg from "../public/symbol-light.svg?raw";
import { useTheme } from "../lib/theme-context.tsx";
import { cn } from "../lib/utils.ts";

// The navbar symbol (docs/BRAND.md) is inlined as a data URL so the SPA and the
// React embed render it without serving any asset: symbol.svg on dark surfaces,
// symbol-light.svg (the deeper "on light" limes) on light ones.
const toDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const DARK_SRC = toDataUrl(symbolSvg);
const LIGHT_SRC = toDataUrl(symbolLightSvg);

/** The xtandard-flags symbol, in the variant for the dashboard's resolved theme. */
export function BrandMark({ className }: { className?: string }) {
  const { resolved } = useTheme();
  return (
    <img
      src={resolved === "dark" ? DARK_SRC : LIGHT_SRC}
      alt=""
      aria-hidden
      className={cn("shrink-0", className)}
    />
  );
}
