#!/bin/sh
# Rebuild the brand kit in docs/assets/ (see docs/BRAND.md): the SVG masters from
# scripts/brand-svg.ts, then every PNG / ICO from them, then the copies the admin UI serves.
# Needs hb-view (HarfBuzz), rsvg-convert (librsvg) and magick (ImageMagick 7); oxipng is used when
# installed. The wordmark is Urbanist (OFL 1.1), downloaded from google/fonts into a cache
# directory, never committed; the SVGs contain only paths. Set URBANIST to use another copy.
set -eu
cd "$(dirname "$0")/.."

fonts="${XDG_CACHE_HOME:-$HOME/.cache}/xtandard-flags-brand"
if [ -z "${URBANIST:-}" ]; then
  mkdir -p "$fonts"
  [ -s "$fonts/Urbanist.ttf" ] ||
    curl -fsSLo "$fonts/Urbanist.ttf" "https://github.com/google/fonts/raw/main/ofl/urbanist/Urbanist%5Bwght%5D.ttf"
  URBANIST="$fonts/Urbanist.ttf"
fi
URBANIST="$URBANIST" bun scripts/brand-svg.ts

cd docs/assets
rsvg-convert -w 1024 -h 1024 logo.svg -o logo.png
rsvg-convert -w 256 -h 256 logo.svg -o logo-256.png
rsvg-convert -w 128 -h 128 logo.svg -o logo-128.png
rsvg-convert -h 256 symbol.svg -o symbol.png
for f in lockup-horizontal-dark lockup-horizontal-light lockup-stacked-dark lockup-stacked-light; do
  rsvg-convert -z 2 "$f.svg" -o "$f.png"
done
rsvg-convert -w 180 -h 180 favicon.svg -o apple-touch-icon.png
rsvg-convert -w 32 -h 32 favicon.svg -o favicon.png
tmp=$(mktemp -d)
for s in 16 32 48; do rsvg-convert -w $s -h $s favicon.svg -o "$tmp/f$s.png"; done
magick "$tmp/f16.png" "$tmp/f32.png" "$tmp/f48.png" favicon.ico
rm -rf "$tmp"
rsvg-convert -w 1280 -h 640 social.svg -o social.png
# Only the brand rasters: the ui-*.png screenshots here are not part of the kit.
if command -v oxipng >/dev/null 2>&1; then
  oxipng -q -o max logo.png logo-256.png logo-128.png symbol.png lockup-*.png apple-touch-icon.png favicon.png social.png
fi

# The admin SPA serves its favicon set and inlines the symbol (src/ui/components/BrandMark.tsx).
cp favicon.svg favicon.ico apple-touch-icon.png symbol.svg ../../src/ui/public/
echo "brand kit rebuilt"
