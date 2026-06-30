# Adapters

Framework adapters are thin wrappers around `createFetchHandler`. The handler is web-standard (`(Request) => Promise<Response>`), so adapters for any fetch-based framework are one page of code.

---

## Elysia — `@xtandard/flags/elysia`

`Elysia.mount` accepts a web-standard fetch function, so the adapter is a direct pass-through.

```ts
import { Elysia } from "elysia";
import { flagsPanel } from "@xtandard/flags/elysia";
import { createRedisStorage } from "@xtandard/flags/storage/redis";
import { basicAuth } from "@xtandard/flags/auth/basic";
import { rolesAuthorization } from "@xtandard/flags/authorization/roles";

const panel = flagsPanel({
  basePath: "/flags",
  sourceStorage: createRedisStorage({ url: process.env.REDIS_URL!, prefix: "app:flags:source" }),
  runtimeStorage: createRedisStorage({ url: process.env.REDIS_URL!, prefix: "app:flags:runtime" }),
  auth: basicAuth({
    users: [{ username: "admin", passwordHash: process.env.HASH!, roles: ["admin"] }],
  }),
  authorization: rolesAuthorization(),
});

new Elysia().mount("/flags", panel).listen(3000);

// Access the admin core from outside the panel (e.g. to seed test data):
const core = panel.core;
```

`flagsPanel` from `@xtandard/flags/elysia` returns a function with a `.core` property attached, giving you access to the `FlagsCore` instance for programmatic use.

---

## Hono — `@xtandard/flags/hono`

Returns a `Hono` sub-app that catches all routes and delegates to the panel handler.

```ts
import { Hono } from "hono";
import { flagsPanel } from "@xtandard/flags/hono";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

const panel = flagsPanel({
  basePath: "/flags",
  sourceStorage: createRedisStorage({ url: process.env.REDIS_URL!, prefix: "app:flags:source" }),
});

const app = new Hono();
app.route("/flags", panel);

export default app;

// Access core:
const core = panel.core;
```

---

## Bun — `@xtandard/flags/bun`

The panel handler is already a web-standard fetch function, so the Bun adapter is a pure passthrough that returns the `CreateFetchHandlerResult` directly.

```ts
import { flagsPanel } from "@xtandard/flags/bun";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

const panel = flagsPanel({
  sourceStorage: createRedisStorage({ url: process.env.REDIS_URL!, prefix: "app:flags:source" }),
});

Bun.serve({
  port: 3000,
  fetch: panel.fetch,
});

// Access core:
const core = panel.core;
```

For a root-mounted panel, omit `basePath`. For a sub-path, set it and strip the prefix in your outer fetch:

```ts
Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/flags")) {
      return panel.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
});
```

---

## `createFetchHandler` — The Underlying Primitive

All adapters call `createFetchHandler` internally. Use it directly to build your own adapter:

```ts
import { createFetchHandler, type FlagsPanelOptions } from "@xtandard/flags";

const { fetch, core } = createFetchHandler({
  sourceStorage,
  runtimeStorage,
  basePath: "/flags",
  auth,
  authorization,
  readonly: false,
  title: "My Flags",
});
```

`fetch(request: Request): Promise<Response>` is a web-standard handler ready to be passed to any framework.

---

## Writing a Thin Adapter for Any Fetch-Based Framework

### Express (via web adapter)

Node's `http.IncomingMessage` is not a web `Request`, but you can bridge it:

```ts
import express from "express";
import { createFetchHandler } from "@xtandard/flags";

const { fetch: panelFetch } = createFetchHandler({ sourceStorage, basePath: "/flags" });

const app = express();
app.use("/flags", (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const webRequest = new Request(url.toString(), {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
  });
  panelFetch(webRequest).then((response) => {
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    response.body
      ? response.body
          .pipeTo(
            new WritableStream({
              write: (chunk) => {
                res.write(chunk);
              },
            }),
          )
          .then(() => res.end())
      : res.end();
  });
});
```

### Next.js Route Handlers (App Router)

```ts
// app/flags/[[...slug]]/route.ts
import { createFetchHandler } from "@xtandard/flags";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

const { fetch: panelFetch } = createFetchHandler({
  sourceStorage: createRedisStorage({ url: process.env.REDIS_URL!, prefix: "app:flags:source" }),
  basePath: "/flags",
});

export const GET = panelFetch;
export const POST = panelFetch;
export const PUT = panelFetch;
export const DELETE = panelFetch;
```

### TanStack Start / Cloudflare Workers

Any runtime that accepts `(Request) => Response | Promise<Response>` can use `createFetchHandler` directly — the return value is exactly that shape.

---

## `FlagsPanelOptions` Reference

| Option                  | Type                    | Default                   | Description                                         |
| ----------------------- | ----------------------- | ------------------------- | --------------------------------------------------- |
| `sourceStorage`         | `FlagsStorage`          | required                  | Canonical store for drafts, history, audit.         |
| `runtimeStorage`        | `FlagsStorage`          | `sourceStorage`           | Published-snapshot store read by the runtime.       |
| `basePath`              | `string`                | `""`                      | Mount prefix, e.g. `"/flags"`.                      |
| `auth`                  | `AuthProvider`          | anonymous                 | Authentication provider.                            |
| `authorization`         | `AuthorizationProvider` | allow all                 | Authorization provider.                             |
| `readonly`              | `boolean`               | `false`                   | Block all mutating operations.                      |
| `title`                 | `string`                | `"@xtandard/flags"`       | Navbar wordmark shown in the UI.                    |
| `logoUrl`               | `string`                | —                         | Logo image URL (replaces the title wordmark).       |
| `defaultProjectKey`     | `string`                | `"default"`               | Default project for the core.                       |
| `defaultEnvironmentKey` | `string`                | `"production"`            | Default environment for the core.                   |
| `uiDir`                 | `string`                | dist/ui beside the module | Directory to serve the bundled UI from.             |
| `core`                  | `FlagsCore`             | —                         | Reuse an existing core instead of constructing one. |

## Express (`@xtandard/flags/express`)

Express predates the Fetch API, so the adapter bridges Node `req`/`res` to the
web-standard handler. **Mount it before any body-parsing middleware** — it reads
the raw request body itself.

```ts
import express from "express";
import { flagsPanel } from "@xtandard/flags/express";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

const app = express();

app.use(
  "/flags",
  flagsPanel({
    basePath: "/flags",
    sourceStorage: createRedisStorage({ url: process.env.REDIS_URL! }),
  }),
);

// Your own JSON routes can mount their parsers after the panel.
app.use(express.json());
app.listen(3000);
```

The returned handler also carries `.core` for programmatic access to the admin
operations (publish, rollback, etc.).

## Typed Elysia plugin + Eden client (`flagsElysia`)

`flagsPanel` mounts a web-standard handler — simplest, but opaque to Eden (the
typed client can't see the routes). For a fully **typed Eden client**, use
`flagsElysia`, which declares the admin routes on a typed Elysia plugin (handlers
delegate to the same pipeline, so auth/validation/logic are reused):

```ts
import { Elysia } from "elysia";
import { flagsElysia } from "@xtandard/flags/elysia";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

const app = new Elysia()
  .use(
    flagsElysia({
      prefix: "/flags",
      sourceStorage: createRedisStorage({ url: process.env.REDIS_URL! }),
    }),
  )
  .listen(3000);

export type App = typeof app;
```

```ts
// client side — fully typed paths/methods/params:
import { treaty } from "@elysiajs/eden";
import type { App } from "./server";

const client = treaty<App>("localhost:3000");

await client.flags.config.get();
const env = client.flags.api
  .projects({ projectKey: "default" })
  .environments({ environmentKey: "production" });
await env.flags.get();
await env.publish.post({ message: "ship it" });
```

## OpenAPI

Every adapter exposes the admin API as an OpenAPI 3.1 document:

```ts
const panel = flagsPanel({ sourceStorage }); // or flagsElysia(...), hono, express
panel.openapi(); // → OpenAPI 3.1 object
```

It's also served at `{basePath}/api/openapi.json`. Merge it into your host app's
docs — e.g. with Elysia's `@elysiajs/openapi` `references`, mirroring how
better-auth integrates its schema:

```ts
import { openapi } from "@elysiajs/openapi";
const flags = flagsElysia({ prefix: "/flags", sourceStorage });
app.use(openapi({ references: flags.openapi() as never })).use(flags);
```

`buildOpenApiDocument({ basePath, title })` is also exported from `@xtandard/flags`
for generating the spec without a running server.
