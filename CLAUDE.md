# @xtandard/flags

Self-hosted, embeddable, OpenFeature-compatible feature-flag control plane: one npm package with
subpath exports (`src/entry-*.ts`, mapped in `package.json` `exports`). Bun for tooling; `vp`
(vite-plus) for build, test, lint and format. Before committing: `bun run format` (oxfmt also
formats `.md`) and `bun run check` (lint + format check + typecheck).

## Docs Site

`site/` is an Astro Starlight site (own `package.json`/lockfile, not published) deployed by
`.github/workflows/pages.yml` to https://me.xantiagoma.com/xtandard-flags/.

- `README.md` and `docs/*.md` (ADRs included) stay the source of truth (they render on
  GitHub/npm). `site/scripts/sync.ts` copies them into `site/src/content/docs/` (generated,
  gitignored), splitting long guides and README sections into pages by H2 per `site/manifest.ts`
  — so **renaming an H2 in `README.md` or `docs/*.md` needs the matching `site/manifest.ts` entry
  updated** (sync fails loudly otherwise), and a new `docs/*.md` must be added to the manifest.
- Site-only pages live in `site/content/` (`index.mdx` is the home page).
- The API reference is generated from `src/` by starlight-typedoc, one module per public entry
  point in `package.json` `exports`; each entry file starts with a `@module <subpath>` doc comment
  (`@module flags` for `src/index.ts`) that names and describes its page.
  `site/scripts/api-overviews.ts` writes the `/api/` and `/api/<module>/` overview pages.
- `bun run docs:dev` / `docs:build` / `docs:preview`. Astro runs under Bun (`bun --bun astro …`);
  `.mdx` is excluded from `vp fmt` (oxfmt mangles MDX). The build fails on any broken internal link.
