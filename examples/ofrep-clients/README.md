# Polyglot OFREP clients — evaluate flags from any language

Evaluate `@xtandard/flags` from **Python, Go, and plain TypeScript** using the
standard OpenFeature SDK + the generic **OFREP** provider — no vendor-specific
library in any of them. All three run the same logic against the same server and
print the same result.

## Two ways to evaluate — and which to use

`@xtandard/flags` gives you two evaluation paths, and it's worth being precise
about the difference (this is exactly the question that prompted these examples):

|                                                | **In-process provider** (`@xtandard/flags/openfeature`) | **OFREP** (this folder)                               |
| ---------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Where eval runs                                | **inside your app**, from an in-memory snapshot         | on the **server**, over HTTP                          |
| Languages                                      | JS/TS only                                              | **any** OpenFeature language                          |
| If the admin/control plane is down             | ✅ unaffected — keeps evaluating                        | ✅ unaffected — OFREP only needs the runtime server   |
| If storage (e.g. Redis) goes down _after_ load | ✅ serves **last-known-good** from memory               | depends on the server's own memory-first cache        |
| Server in the request path?                    | ❌ no                                                   | ✅ yes (mitigated by ETag/304 + the provider's cache) |

So your understanding is right:

- **For a JS/TS app, the in-process provider is the resilient, memory-first path.**
  After the first load it evaluates entirely from memory — the admin panel can be
  down, and if Redis drops _after_ the snapshot is loaded it keeps serving the
  last-known-good values (marked `stale`). The control plane is never in the
  request path.
- **OFREP is how _other_ languages (Go, Python, …) consume the same flags.** The
  app calls the server's OFREP endpoint. To keep that resilient too, run the
  `@xtandard/flags` **standalone server next to your app** (it is itself
  memory-first over Redis), and rely on OFREP's `ETag`/`304` caching — so polling
  is cheap and the server keeps answering from memory even if Redis blips.

If you want the in-process style in JS/TS, see [`../openfeature-redis`](../openfeature-redis).
This folder is specifically the **remote, any-language** path.

## Run it

**1. Start a server and seed it.** Any of these works — pick one:

```bash
# from the repo (this checkout):
PORT=8080 STREAMING=1 bun run demo          # seeds a full demo dataset, or…
# or the published CLI, then seed the two flags these clients read:
PORT=8080 STREAMING=1 npx @xtandard/flags serve
FLAGS_URL=http://localhost:8080 ./seed.sh   # creates new-checkout + banner-color
```

**2. Run any client** (each reads `FLAGS_URL`, default `http://localhost:8080`):

```bash
# Python (uv)
cd python && FLAGS_URL=http://localhost:8080 uv run main.py

# Go
cd go && go mod tidy && FLAGS_URL=http://localhost:8080 go run .

# TypeScript (plain OpenFeature, no @xtandard/flags)
cd typescript && bun install && FLAGS_URL=http://localhost:8080 bun run main.ts
```

Each prints the same thing:

```
OFREP @ http://localhost:8080
  new-checkout = true                          # rule: plan == "beta" → on
  banner-color = #2563eb  (reason=STATIC, variant=blue)
```

> Toolchains: an optional [`mise.toml`](./mise.toml) pins python/go/node — run
> `mise install` to use them, or just use your own.

## The provider packages (any language, same idea)

| Language   | OpenFeature SDK                  | OFREP provider                                           | Init                                |
| ---------- | -------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| Python     | `openfeature-sdk`                | `openfeature-provider-ofrep`                             | `OFREPProvider(base_url=...)`       |
| Go         | `github.com/open-feature/go-sdk` | `github.com/open-feature/go-sdk-contrib/providers/ofrep` | `ofrep.NewProvider(url)`            |
| TypeScript | `@openfeature/server-sdk`        | `@openfeature/ofrep-provider`                            | `new OFREPProvider({ baseUrl })`    |
| Web        | `@openfeature/web-sdk`           | `@openfeature/ofrep-web-provider`                        | `new OFREPWebProvider({ baseUrl })` |
| .NET       | `OpenFeature`                    | `OpenFeature.Providers.Ofrep`                            | `new OfrepProvider(...)`            |
| Java       | `dev.openfeature:sdk`            | community OFREP provider                                 | —                                   |

Same pattern everywhere: set the OFREP provider with your panel URL, then use the
normal OpenFeature client. That's the point of OFREP — one server, every language,
no custom SDK. For the wire protocol itself (curl, ETag/304, live SSE), see the
[`../ofrep`](../ofrep) example.
