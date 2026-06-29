# Releases

---

## Versioning

`@xtandard/flags` follows [Semantic Versioning](https://semver.org). The current version is `0.1.0` — early but functional. APIs may shift before `1.0`.

- **Patch** (`0.1.x`) — bug fixes, non-breaking tweaks.
- **Minor** (`0.x.0`) — additive features, backwards-compatible.
- **Major** (`x.0.0`) — breaking changes.

Breaking changes before `1.0` may occur on minor version bumps.

---

## Changelog Generation

Changelogs are generated from conventional commits using [changelogen](https://github.com/unjs/changelogen):

```bash
bunx changelogen --release
```

This bumps the version in `package.json`, generates/updates `CHANGELOG.md`, and creates a git tag.

---

## Release Flow (GitHub Actions)

The release workflow (`.github/workflows/release.yml`) is triggered by pushing a version tag (`v*`):

1. Run `bun install --frozen-lockfile`.
2. Run `bun run check` (lint + format check + typecheck).
3. Run `bun run test`.
4. Run `bun run build` (lib + UI).
5. Publish to npm with `--provenance` (requires `id-token: write` permission in the workflow).

npm provenance links the published package to the specific GitHub Actions run that built it, so consumers can verify the build chain.

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
