/// <reference path="../assets.d.ts" />
import symbolSvg from "../public/symbol.svg?raw";
import { useTheme } from "../lib/theme-context.tsx";
import { cn } from "../lib/utils.ts";

// The navbar symbol (docs/BRAND.md) is inlined as a data URL so the SPA and the
// React embed render it without serving any asset. On light surfaces the
// gradient switches to the deeper "on light" limes, as the light lockups do.
const toDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const DARK_SRC = toDataUrl(symbolSvg);
const DARK_STOPS = ["#D9F99D", "#A3E635", "#65A30D"];
const LIGHT_STOPS = ["#A3E635", "#84CC16", "#4D7C0F"];
const LIGHT_SRC = toDataUrl(
  symbolSvg.replace(/stop-color="(#[0-9A-F]{6})"/g, (m: string, hex: string) => {
    const i = DARK_STOPS.indexOf(hex);
    return i < 0 ? m : `stop-color="${LIGHT_STOPS[i]}"`;
  }),
);

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
