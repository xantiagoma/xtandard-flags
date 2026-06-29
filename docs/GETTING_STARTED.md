# Getting Started

A complete walkthrough from install to evaluating your first flag in production.

---

## 1. Install

```bash
bun add @xtandard/flags

# Install the integrations you plan to use (all are optional peer deps):
bun add redis                     # Redis storage adapter
bun add unstorage                 # Unstorage adapter
bun add @openfeature/server-sdk   # OpenFeature provider
bun add elysia                    # Elysia adapter
bun add hono                      # Hono adapter
```

---

## 2. Embed the Admin Panel

### Elysia

```ts
import { Elysia } from "elysia";
import { flagsPanel } from "@xtandard/flags/elysia";
import { createRedisStorage } from "@xtandard/flags/storage/redis";
import { basicAuth } from "@xtandard/flags/auth/basic";
import { rolesAuthorization } from "@xtandard/flags/authorization/roles";

new Elysia()
  .mount(
    "/flags",
    flagsPanel({
      basePath: "/flags",
      sourceStorage: createRedisStorage({
        url: process.env.REDIS_URL!,
        prefix: "myapp:flags:source",
      }),
      runtimeStorage: createRedisStorage({
        url: process.env.REDIS_URL!,
        prefix: "myapp:flags:runtime",
      }),
      auth: basicAuth({
        users: [
          {
            username: "admin",
            passwordHash: process.env.FLAGS_ADMIN_PASSWORD_HASH!,
            roles: ["admin"],
          },
        ],
      }),
      authorization: rolesAuthorization(),
    }),
  )
  .listen(3000);
```

Visit `http://localhost:3000/flags` for the admin UI.

### Hono

```ts
import { Hono } from "hono";
import { flagsPanel } from "@xtandard/flags/hono";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

const app = new Hono();

app.route(
  "/flags",
  flagsPanel({
    basePath: "/flags",
    sourceStorage: createRedisStorage({
      url: process.env.REDIS_URL!,
      prefix: "myapp:flags:source",
    }),
  }),
);

export default app;
```

---

## 3. Run Standalone

The standalone server reads everything from environment variables. The simplest way to try it out:

```bash
bun run apps/standalone/src/index.ts
# Admin UI at http://localhost:3000
# Healthcheck at http://localhost:3000/healthcheck
```

With Redis and basic auth:

```bash
SOURCE_STORAGE_DRIVER=redis \
RUNTIME_STORAGE_DRIVER=redis \
REDIS_URL=redis://localhost:6379 \
AUTH_MODE=basic \
AUTH_USERNAME=admin \
AUTH_PASSWORD_HASH="$(bun -e "const {hashPassword} = await import('./src/auth/basic.ts'); console.log(await hashPassword('mypassword'))")" \
bun run apps/standalone/src/index.ts
```

### Docker

```bash
# Build from the repository root:
docker build -f apps/standalone/Dockerfile -t xtandard-flags .

# Run with Redis:
docker run --rm -p 3000:3000 \
  -e SOURCE_STORAGE_DRIVER=redis \
  -e RUNTIME_STORAGE_DRIVER=redis \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e AUTH_MODE=basic \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD_HASH='scrypt$...' \
  xtandard-flags
```

Or pull the published image:

```bash
docker run --rm -p 3000:3000 \
  -e SOURCE_STORAGE_DRIVER=redis \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  ghcr.io/xantiagoma/xtandard-flags:latest
```

---

## 4. Create Your First Flag

### Via the Admin UI

1. Open the admin UI at `http://localhost:3000` (or wherever you mounted it).
2. Navigate to your project/environment (defaults to `default` / `production`).
3. Create a boolean flag — key `new-dashboard`, enabled, default variant `off`.
4. Click **Publish** to compile the draft and activate it.

### Via the API

```bash
# Create (upsert) a flag
curl -X POST http://localhost:3000/api/projects/default/environments/production/flags \
  -H "Content-Type: application/json" \
  -u admin:mypassword \
  -d '{
    "key": "new-dashboard",
    "type": "boolean",
    "enabled": true,
    "defaultVariant": "off",
    "variants": {
      "on":  { "value": true  },
      "off": { "value": false }
    },
    "fallthrough": { "variant": "off" }
  }'

# Publish the draft
curl -X POST http://localhost:3000/api/projects/default/environments/production/publish \
  -H "Content-Type: application/json" \
  -u admin:mypassword \
  -d '{"message": "initial launch"}'
```

### Via the CLI

```bash
# Use the CLI against your running storage:
SOURCE_STORAGE_DRIVER=redis REDIS_URL=redis://localhost:6379 \
  bunx xtandard-flags init

# After editing flags via the UI or API, publish:
SOURCE_STORAGE_DRIVER=redis REDIS_URL=redis://localhost:6379 \
  bunx xtandard-flags publish --message "initial launch"
```

---

## 5. Consume Flags via OpenFeature

```ts
import { OpenFeature } from "@openfeature/server-sdk";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createRedisStorage } from "@xtandard/flags/storage/redis";

// Wire up the provider once at startup:
const provider = createOpenFeatureProvider({
  projectKey: "default",
  environmentKey: "production",
  storage: createRedisStorage({
    url: process.env.REDIS_URL!,
    prefix: "myapp:flags:runtime",
  }),
  refreshIntervalMs: 10_000,
});

await OpenFeature.setProviderAndWait(provider);

// Evaluate flags — all reads are in-memory, never touch storage:
const client = OpenFeature.getClient();

// Boolean flag
const showDashboard = await client.getBooleanValue("new-dashboard", false, {
  targetingKey: user.id,
});

// String flag with targeting context
const theme = await client.getStringValue("theme", "light", {
  targetingKey: user.id,
  plan: user.plan,
  country: user.country,
});
```

After the first load the provider evaluates flags from memory. If the admin panel or Redis goes down, evaluation continues unaffected. If storage fails after the initial load, the provider serves the last-known-good snapshot with reason `STALE` until the next successful refresh.

---

## Quick-Reference: Storage Modes

| Mode                | Source              | Runtime              | When to use            |
| ------------------- | ------------------- | -------------------- | ---------------------- |
| Simple (default)    | any                 | same                 | Local dev, single-node |
| Redis (recommended) | Redis source prefix | Redis runtime prefix | Production             |
| File                | file storage        | file storage         | Gitops / offline dev   |
| Memory              | memory              | memory               | Tests                  |

See [Storage](STORAGE.md) for full details.
