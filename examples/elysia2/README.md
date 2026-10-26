# Elysia 2 × @xtandard/flags

Same demo as [`elysia/`](../elysia), on **Elysia 2** (`elysia@rc`), plus two
Elysia 2 specifics:

- **Typed admin plugin** — `flagsElysia` from `@xtandard/flags/elysia2` declares the
  admin routes, so Elysia 2's Eden (`@elysia/eden`) calls them fully typed. Use
  `@xtandard/flags/elysia` on Elysia 1.x.
- **Per-request flag context** — `.wrap()` runs each request inside OpenFeature's
  transaction context (AsyncLocalStorage). Handlers call
  `client.getBooleanValue("new-greeting", false)` with **no context argument**;
  the `targetingKey` comes from `?user=`.

## What's here

- **`GET /`** — HTML page driven by `new-greeting`, `banner-color`, `max-items`.
- **`GET /?user=alice`** — `alice` has an override on `new-greeting`, so she sees
  the new headline; everyone else gets the old one.
- **`GET /flags`** — the admin panel.

## Run it

```bash
bun install
bun run start  # honors PORT; defaults to 3000
```

Or from the repo root: `bun run examples:elysia2`.

> `setTransactionContext` returns `void`, so the `.wrap()` captures the response
> through a `Promise` — returning its result directly would hand Elysia `undefined`.
