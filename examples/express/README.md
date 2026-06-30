# Express × @xtandard/flags

Mount the admin panel **and** serve a user-facing page whose output is driven by
live flag values — so you can _see_ a flag change take effect.

## What's here

- **`GET /`** — an HTML demo page rendered from three flags resolved through the
  `@xtandard/flags` OpenFeature provider:
  - `new-greeting` (boolean) — flips the headline.
  - `banner-color` (string) — sets the banner color.
  - `max-items` (number) — how many list items render.
- **`GET /flags`** — the embedded admin panel. Mount it **before** any
  body-parsing middleware — the panel reads the raw request body.

The panel publishes to a `runtimeStorage` dir; the OpenFeature provider reads
from the **same dir** and refreshes every **2 seconds** (`refreshIntervalMs`),
so a Publish shows up on the next page load without restarting the server.

On first boot the app seeds an initial published snapshot (idempotently — it
no-ops once anything is published), so `/` shows flag-driven output immediately.

## Run it

```bash
bun install                 # links @xtandard/flags + @openfeature/server-sdk
bun run start               # honors PORT; defaults to 3000
```

Then open <http://localhost:3000>.

## The loop

1. Open <http://localhost:3000> — note the banner, headline, and item count.
2. Open <http://localhost:3000/flags>, change a flag (e.g. set `banner-color`'s
   fallthrough to the green variant), and click **Publish**.
3. Refresh <http://localhost:3000> — within ~2 seconds the page reflects it.

## Files

- [`src/index.ts`](./src/index.ts) — wires the panel, the provider, and the demo route.
- [`src/demo.ts`](./src/demo.ts) — the idempotent boot seed and the HTML renderer.
