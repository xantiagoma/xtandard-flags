# Releases

---

## Versioning — ZeroVer (`0.x.x` forever)

`@xtandard/flags` follows [**ZeroVer**](https://0ver.org) ("0-based versioning"):
the major version stays at `0` **indefinitely** — there is no planned `1.0`. This is
the same convention `@xtandard/lib` uses, and the same one plenty of widely-used
packages quietly run on. It's an honest signal that the API can still evolve, not a
statement that the software is unfinished.

Within `0.x`, increments follow [SemVer](https://semver.org) **as npm interprets
`0.x` ranges** (a caret range like `^0.4.1` allows `0.4.x` but not `0.5.0`):

- **Minor** (`0.x.0`) — breaking changes / significant features.
- **Patch** (`0.x.y`) — bug fixes and backwards-compatible additions.

So pin with `^0.x.y` to get fixes without surprise breakage, and read the
[CHANGELOG](../CHANGELOG.md) before bumping the minor.

---

## Changelog Generation

Changelogs are generated from conventional commits using [changelogen](https://github.com/unjs/changelogen):

```bash
bun run release   # = changelogen --release --push
```

This bumps the version in `package.json` (from the commits since the last tag),
generates/updates `CHANGELOG.md`, creates a release commit + git tag, and pushes —
which triggers the publish workflow below.

---

## Prerequisites (one-time)

- An npm **automation token** with publish rights to the `@xtandard` scope, stored
  as the **`NPM_TOKEN`** GitHub Actions secret.
- The `@xtandard` scope must exist on npm (the package publishes with `--access public`).

---

## Release Flow (GitHub Actions)

Quality gates (lint, format, typecheck, unit + bun + e2e tests) run on every push via
the **CI** workflow. The **Release** workflow (`.github/workflows/release.yml`) is
separate and triggered by pushing a version tag (`v*`):

1. `bun install --frozen-lockfile`
2. `bun run build` (lib + UI + react)
3. `bunx publint` (package-correctness check)
4. `npm publish --provenance --access public` (auth via `NPM_TOKEN`)
5. Create a **GitHub Release** for the tag (`gh release create … --generate-notes`),
   so it appears on the repo's [Releases](https://github.com/xantiagoma/xtandard-flags/releases) page.

**First release:** `git tag v0.1.0 && git push origin v0.1.0`.
**Ongoing releases:** `bun run release`.

npm provenance links the published package to the specific GitHub Actions run that
built it (`id-token: write` in the workflow), so consumers can verify the build chain.

---

## Docker Image Tags

The Docker image is published to GitHub Container Registry (`ghcr.io/xantiagoma/xtandard-flags`). Tags follow the pattern:

| Tag                      | Updated on                 |
| ------------------------ | -------------------------- |
| `latest`                 | Every release              |
| `v0.1.0` (exact version) | That release only          |
| `v0.1` (minor)           | Each patch on that minor   |
| `v0` (major)             | Each release on that major |

Pull a specific version for reproducible deployments:

```bash
docker pull ghcr.io/xantiagoma/xtandard-flags:v0.1.0
```

---

## npm Package Contents

The published package (as declared in `files` in `package.json`) includes:

```
dist/           ← compiled ESM/CJS dual build + type declarations
bin/            ← CLI entry point (xtandard-flags.mjs)
docs/           ← this documentation set
LICENSE
README.md
```

Source files and tests are not included. The UI bundle (`dist/ui/`) is included inside `dist/`.
