# Vercel Flags SDK × @xtandard/flags (OpenFeature)

A minimal Next.js (App Router) app that consumes `@xtandard/flags` through the
[Vercel Flags SDK](https://flags-sdk.dev) via its
[OpenFeature adapter](https://flags-sdk.dev/docs/providers/openfeature).

Because `@xtandard/flags` ships a standard **OpenFeature provider**, there's no
custom glue — the SDK talks to it like any other provider, and you keep the
memory-first guarantee (the provider serves from an in-memory snapshot and
survives the control plane / storage being down).

## How it fits together

```
Vercel Flags SDK  ──(@flags-sdk/openfeature)──▶  OpenFeature client
                                                      │
                                   createOpenFeatureProvider()  ← @xtandard/flags
                                                      │
                                          runtime storage (file/redis/…)
                                                      ▲
                                   published from the @xtandard/flags admin panel
```

- [`flags.ts`](./flags.ts) — builds the adapter from our provider and declares
  `new-checkout` (boolean), `banner-color` (string), `home-layout` (json).
- [`app/page.tsx`](./app/page.tsx) — a Server Component that evaluates them.
- [`seed.ts`](./seed.ts) — publishes those flags to local file storage so the
  app shows real values without standing up the panel. In production you'd
  author + publish from the admin UI instead and point storage at the same store.

## Run it

```bash
bun install
bun run seed     # publish demo flags to ./.flags-data/runtime
bun run dev      # http://localhost:3000
```

The page shows the evaluated values for the context `{ targetingKey, country: "FR", plan: "beta" }`:
`new-checkout = true` (matches the EU-beta rule), `banner-color = #16a34a`,
`home-layout = { columns: 3, hero: "carousel" }`.

## Pointing at a real deployment

Swap the file storage in `flags.ts` for whatever your panel publishes to —
e.g. `createRedisStorage({ url, prefix: "xtandard:flags:runtime" })` — and drop
`seed.ts`. Set `FLAGS_DATA_DIR` (or the storage config) to match the panel.

> Note: with the OpenFeature adapter, every flag **must** declare a `defaultValue`
> — it's what the SDK serves if the flag is missing or the provider can't resolve it.
