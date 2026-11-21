# Brand

The xtandard-flags mark is the family's lime **X**: a `>` chevron and two arms between grey angle
brackets. Its upper-right arm stops short and a **flag** is planted on it: a grey pole with a lime
swallowtail pennant, a feature flag raised. It comes as an app icon, a bare mark and wordmark
lockups. Everything lives in [`docs/assets/`](assets/); the SVGs are the masters and every PNG and
ICO is built from them.

It belongs with its siblings: the near-black rounded tile, the orbit lines, the grey brackets and the
lime X are shared with `@xtandard/webhooks` (a hook on the arm), `@xtandard/entitlements` (a gauge),
`@xtandard/audit` (a shield) and `@xtandard/links` (a chain link); the layout of the lockups and the
social card follows `xtandard-image`'s kit. The flag is what makes it this project.

## Files

| File                                                   | What it is                                                                                       | Use it for                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `logo.svg`                                             | App icon: the mark on a near-black rounded square with faint orbit lines                         | Where an app-icon shape is expected: avatars, the repository picture (never shown on a page)     |
| `symbol.svg`, `symbol-light.svg`                       | The mark with brackets, transparent: for dark surfaces, and with the deeper limes for light ones | The standalone mark on pages: the admin panel header (by theme)                                  |
| `lockup-horizontal-dark.svg`                           | Mark + wordmark, `xtandard-` in near-white                                                       | Headers on dark backgrounds (README in GitHub dark mode, the docs site in dark mode)             |
| `lockup-horizontal-light.svg`                          | Mark + wordmark, `xtandard-` in ink, deeper lime                                                 | Headers on light backgrounds (README in light mode, the docs site in light mode)                 |
| `lockup-stacked-{dark,light}.svg`                      | Mark left, `xtandard-` over `flags`                                                              | The docs home hero (by theme); square-ish slots: slides, sidebars                                |
| `monochrome-white.svg`, `monochrome-black.svg`         | One-colour horizontal lockup                                                                     | Photos and busy backgrounds (white); print (black)                                               |
| `favicon.svg`                                          | The icon without orbit lines and shadow, which do not survive 16 px                              | Browser tabs: the admin panel and the docs site                                                  |
| `favicon.ico` (16/32/48), `apple-touch-icon.png` (180) | Raster fallbacks of `favicon.svg`                                                                | `<head>` only: browsers without SVG favicons, iOS home-screen icons                              |
| `social.svg`, `social.png` (1280×640)                  | Social card: icon, wordmark, tagline, `bun add` line                                             | GitHub social preview (Settings → Social preview, uploaded by hand), `og:image` of the docs site |

Everything a page shows (README, docs site, admin panel) is an SVG, and none of it is the tile: pages
use the transparent symbol or the lockups; the tile (`logo.svg`, the favicons, the social card) is only
for app-icon slots. The only rasters are the ones a
format requires and no page displays as an icon: `favicon.ico` and `apple-touch-icon.png` (`<head>`
fallbacks) and `social.png` (`og:image` must be raster).

Rebuild after editing:

```sh
sh scripts/brand-assets.sh   # SVG masters, the ICO / PNG fallbacks, the admin panel's copies
```

It needs `hb-view` (HarfBuzz), `rsvg-convert` (librsvg) and `magick` (ImageMagick 7), and uses
`oxipng` when installed. It downloads Urbanist from google/fonts into
`~/.cache/xtandard-flags-brand/` (set `URBANIST` to use another copy); the font is never committed.
`scripts/brand-svg.ts` holds the geometry (one 1024-unit grid) and shapes the wordmark with HarfBuzz;
the shell script rasterizes and copies `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`,
`symbol.svg` and `symbol-light.svg` into `src/ui/public/` for the admin panel.

### Where each file goes

- **README header**: a `<picture>` choosing `lockup-horizontal-dark.svg` / `lockup-horizontal-light.svg`
  with `prefers-color-scheme`, by absolute `raw.githubusercontent.com` URL (the README ships to npm,
  which does not ship `docs/`).
- **Docs site**: the horizontal lockups as the Starlight logo (light/dark), the stacked lockups (light/dark) as the home page's hero image,
  `favicon.svg` + `favicon.ico` + `apple-touch-icon.png`, and `social.png` as `og:image`
  (`site/scripts/sync.ts` copies them into the site's `public/`).
- **Admin panel** (standalone and the React embed): `symbol.svg` / `symbol-light.svg` (by theme)
  inlined in the header next to the title (`src/ui/components/BrandMark.tsx`; a host's `logoUrl` replaces both), and the favicon set in
  `src/ui/index.html`.

## Palette

Lime on charcoal, as in the family. Lime is an artwork colour on dark surfaces; on white use the
deeper lime for text.

| Token          | Hex                                 | Role                                                      | Contrast on white / on ink |
| -------------- | ----------------------------------- | --------------------------------------------------------- | -------------------------- |
| `xf-lime-hi`   | `#D9F99D`                           | Top-left of the mark gradient, the social-card tagline    | 1.18 / 15.9                |
| `xf-lime`      | `#A3E635`                           | The mark, accents and links on dark surfaces              | 1.55 / 12.1                |
| `xf-lime-deep` | `#65A30D`                           | Bottom-right of the mark gradient                         | 2.9 / 6.5                  |
| `xf-lime-text` | `#4D7C0F`                           | Accent text and the wordmark's end on light surfaces (AA) | 5.0 / 3.8                  |
| `xf-ink`       | `#0F1215`                           | Icon surface, dark page background, `xtandard-` on light  | 18.8 / —                   |
| `xf-orbit`     | `#4E5459`                           | Orbit lines and dots                                      | 7.7 / 2.5                  |
| `xf-bracket`   | `#5B6167`                           | The angle brackets                                        | 6.3 / 3.0                  |
| `xf-pole`      | `#6B7178` (dark), `#8B939C` (light) | The flag's pole                                           | —                          |
| `xf-slate`     | `#8B939C`                           | Secondary text on ink (the social-card command)           | 3.1 / 6.0                  |
| `xf-paper`     | `#FAFAFA`                           | `xtandard-` on dark                                       | 1.04 / 18.0                |

### Gradients

Lit from the top left, as in every xtandard mark.

| Shape                     | Stops                                                                             |
| ------------------------- | --------------------------------------------------------------------------------- |
| Mark (X + pennant), dark  | `#D9F99D` → `#A3E635` 42% → `#65A30D`, top left to bottom right                   |
| Mark, light surfaces      | `#A3E635` → `#84CC16` 42% → `#4D7C0F`                                             |
| `flags` (wordmark), dark  | `#D9F99D` → `#A3E635`, top to bottom                                              |
| `flags` (wordmark), light | `#84CC16` → `#4D7C0F`                                                             |
| Icon surface              | `#1A1C1F` → `#08090B`, top to bottom, with a 4-unit white rim at 14% → 3% opacity |

## Wordmark

`xtandard-flags` in **Urbanist** Black (900), shaped by HarfBuzz and converted to paths (the SVGs
need no font), the same face as the rest of the family. `xtandard-` is paper on dark and ink on
light; `flags` is always the lime gradient. The social card adds Urbanist SemiBold (600) for the
tagline and a monospace face for the `bun add` line. Urbanist is SIL OFL 1.1; the SVGs contain glyph
outlines, not font software.

## Geometry

One 1024-unit grid. The chevron is `M250 300 L395 300 L560 512 L395 724 L250 724 L415 512 Z`; the
arms run along the same diagonals (slope 165/212) with a 46-unit gap. The upper arm stops at y 352;
a 22-unit grey pole rises from near its left corner to y 128, and the pennant (172 × 118, wavy top
and bottom edges, a 50-unit swallowtail notch) flies right from the pole's top. In the app icon the
mark is scaled by 0.86 and centred; the tile's corner radius is 224 (21.9%).

**Clear space**: the pennant's height on every side of the mark or a lockup. **Minimum sizes**: app
icon 16 px (use the favicon set below 48 px), horizontal lockup 24 px high, stacked lockup 48 px
high.

## Do and don't

Do:

- Use the dark lockup on dark backgrounds and the light one on light; on GitHub switch with
  `<picture>` and `prefers-color-scheme`.
- Use the app icon wherever a square avatar is expected; the monochrome lockups on photos or in print.

Don't:

- Recolour the mark (it is lime like the other xtandard libraries; blue belongs to xtandard-image).
- Detach the flag from the arm, move it to another arm, or make the pole lime (the pole is grey; the
  pennant carries the colour).
- Put the dark lockup on a light background or vice versa; stretch, rotate or add effects.
- Set the wordmark in another font or as live text.
