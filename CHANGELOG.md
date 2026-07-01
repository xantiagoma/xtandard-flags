# Changelog


## v0.1.6

[compare changes](https://github.com/xantiagoma/xtandard-flags/compare/v0.1.5...v0.1.6)

### 🩹 Fixes

- **storage:** Make the Drizzle exports compatible with `drizzle-orm@1.0` beta — widen the peer range (`>=0.44.0 || >=1.0.0-0`) and return the portable `DrizzleKvTable` from the `*FlagsTable` factories so their `.d.ts` no longer freezes the 0.45 `PgColumn` brand (fixes TS2883/TS2322 for consumers on `1.0.0-beta.x`). Verified against both `1.0.0-beta.22` and `0.45.x`. ([8397b69](https://github.com/xantiagoma/xtandard-flags/commit/8397b69))

### ❤️ Contributors

- Santiago Montoya ([@xantiagoma](https://github.com/xantiagoma))


## v0.1.5

[compare changes](https://github.com/xantiagoma/xtandard-flags/compare/v0.1.4...v0.1.5)

### 🚀 Enhancements

- **hooks:** Control-plane `before`/`after` hooks on the admin core (throw to deny; best-effort side effects) ([e40d149](https://github.com/xantiagoma/xtandard-flags/commit/e40d149))
- **hooks:** Map before-hook denials to HTTP status via `HookDeniedError` ([8bf47ef](https://github.com/xantiagoma/xtandard-flags/commit/8bf47ef))
- **hooks:** Bundled `hooks/webhook` (HMAC + retry) and `hooks/log` reference adapters ([4ae1dba](https://github.com/xantiagoma/xtandard-flags/commit/4ae1dba))
- **hooks:** Pinned flag tests that gate publishing (`hooks/test-gate` + `Flag.tests`) ([b117e8b](https://github.com/xantiagoma/xtandard-flags/commit/b117e8b))
- **eval:** `onEvaluation` runtime-plane observer for usage/exposure (in-process provider + OFREP) ([70ea275](https://github.com/xantiagoma/xtandard-flags/commit/70ea275))
- **embed:** Cross-origin support for the embedded dashboard (`credentials`/`fetch` props + panel `cors`) ([cc6a15c](https://github.com/xantiagoma/xtandard-flags/commit/cc6a15c))
- **storage:** Drizzle adapter (`storage/drizzle`) + `drizzle/{pg,mysql,sqlite}` table factories ([1649545](https://github.com/xantiagoma/xtandard-flags/commit/1649545))
- **storage:** Composable `withWatch` + `pgListenNotify` — add `watch` to any storage from any change source ([17dab87](https://github.com/xantiagoma/xtandard-flags/commit/17dab87))

### 🩹 Fixes

- **hooks:** Map `HookDeniedError` from separate bundles by name, not `instanceof` ([723121c](https://github.com/xantiagoma/xtandard-flags/commit/723121c))
- **examples:** Map `@xtandard/flags/hooks/*` to source in examples tsconfig ([20760de](https://github.com/xantiagoma/xtandard-flags/commit/20760de))

### 📖 Documentation

- **hooks:** Add `docs/HOOKS.md` + runnable `examples/hooks` (all hook flavors incl. `onEvaluation`) ([3839a16](https://github.com/xantiagoma/xtandard-flags/commit/3839a16))
- **embed:** Document CORS ownership — mount vs plugin, no double-up ([b0c12d6](https://github.com/xantiagoma/xtandard-flags/commit/b0c12d6))
- **storage:** Make watch coverage explicit (which adapters self-notify) + `withWatch` override behavior ([e9b3325](https://github.com/xantiagoma/xtandard-flags/commit/e9b3325))

### ❤️ Contributors

- Santiago Montoya ([@xantiagoma](https://github.com/xantiagoma))


## v0.1.4

[compare changes](https://github.com/xantiagoma/xtandard-flags/compare/v0.1.3...v0.1.4)

### 🚀 Enhancements

- **cli:** Complete `--help` (all env vars/drivers, options, examples) + add `--version` ([08b9bc6](https://github.com/xantiagoma/xtandard-flags/commit/08b9bc6))

### 📖 Documentation

- Complete env/driver reference (incl. sqlite) + clarify the `xtandard-flags` binary vs `@xtandard/flags` package ([9274cba](https://github.com/xantiagoma/xtandard-flags/commit/9274cba))

### ❤️ Contributors

- Santiago Montoya ([@xantiagoma](https://github.com/xantiagoma))


## v0.1.3

[compare changes](https://github.com/xantiagoma/xtandard-flags/compare/v0.1.2...v0.1.3)

### 🚀 Enhancements

- **ofrep:** Full OpenFeature compliance — ETag/304, flag metadata, opt-in SSE ([4efae2e](https://github.com/xantiagoma/xtandard-flags/commit/4efae2e))
- **examples:** One-command runner for the polyglot OFREP clients ([f0b8ad8](https://github.com/xantiagoma/xtandard-flags/commit/f0b8ad8))

### 🩹 Fixes

- **ci:** Exclude cli.ts from coverage; add pre-commit + pre-push hooks ([8bdb873](https://github.com/xantiagoma/xtandard-flags/commit/8bdb873))

### 📖 Documentation

- **examples:** OFREP client example + polyglot Python/Go/plain-TS clients ([d22157b](https://github.com/xantiagoma/xtandard-flags/commit/d22157b), [a90ad9b](https://github.com/xantiagoma/xtandard-flags/commit/a90ad9b))
- **examples:** Auth + authorization flexibility demo ([cd5bc54](https://github.com/xantiagoma/xtandard-flags/commit/cd5bc54))
- **readme:** Frame the two evaluation paths — in-process (recommended) vs OFREP ([53a2d47](https://github.com/xantiagoma/xtandard-flags/commit/53a2d47))

### ❤️ Contributors

- Santiago Montoya ([@xantiagoma](https://github.com/xantiagoma))


## v0.1.2

[compare changes](https://github.com/xantiagoma/xtandard-flags/compare/v0.1.1...v0.1.2)

### 🚀 Enhancements

- **cli:** Print resolved storage location on `serve` startup ([19cc902](https://github.com/xantiagoma/xtandard-flags/commit/19cc902))

### 🩹 Fixes

- **ci:** Exclude changelogen's CHANGELOG.md from the format check ([8810808](https://github.com/xantiagoma/xtandard-flags/commit/8810808))

### 🤖 CI

- **release:** Publish the GitHub Release even when changelogen pre-created a draft ([b85c7a5](https://github.com/xantiagoma/xtandard-flags/commit/b85c7a5))

### ❤️ Contributors

- Santiago Montoya ([@xantiagoma](https://github.com/xantiagoma))

## v0.1.1

[compare changes](https://github.com/xantiagoma/xtandard-flags/compare/v0.1.0...v0.1.1)

### 🏡 Chore

- Align npm keywords with the GitHub topics ([094e0a7](https://github.com/xantiagoma/xtandard-flags/commit/094e0a7))

### 🤖 CI

- **release:** Create a GitHub Release on tag push ([80ce518](https://github.com/xantiagoma/xtandard-flags/commit/80ce518))

### ❤️ Contributors

- Santiago Montoya ([@xantiagoma](https://github.com/xantiagoma))

