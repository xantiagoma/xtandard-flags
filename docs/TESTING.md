# Testing

---

## Running Tests

```bash
# Run the full test suite:
bun run test

# Run with coverage report:
bun run test:coverage

# Run end-to-end tests (Playwright):
bun run test:e2e
```

The test script runs `vp test run` (Vitest via vite-plus). Tests are in the `test/` directory.

### Redis Integration Tests

Redis tests (`test/storage-redis.test.ts`) are skipped unless the `REDIS_URL` environment variable is set. Set it to run them against a live Redis instance:

```bash
REDIS_URL=redis://localhost:6379 bun run test
```

The tests use a unique key prefix per run (`xtandard-flags-test:{timestamp}`) and clean up after themselves.

---

## Test Suite Layout

| File                               | What it covers                                                              |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `test/evaluator.test.ts`           | `evaluateFlag` — all evaluation steps                                       |
| `test/conditions.test.ts`          | `evaluateCondition` — all 17 operators                                      |
| `test/splits.test.ts`              | `pickVariant` — determinism, weighting, edge cases                          |
| `test/hash.test.ts`                | MurmurHash3 implementation                                                  |
| `test/snapshot.test.ts`            | `compileDraft`, `nextVersion`, `SnapshotStore`                              |
| `test/validation.test.ts`          | `validateDraft`, `validateFlag`, `DraftValidationError`                     |
| `test/storage-memory.test.ts`      | Memory adapter including watch                                              |
| `test/storage-file.test.ts`        | File adapter including watch                                                |
| `test/storage-redis.test.ts`       | Redis adapter (skipped without `REDIS_URL`)                                 |
| `test/storage-unstorage.test.ts`   | Unstorage adapter                                                           |
| `test/auth-none.test.ts`           | `noAuth`                                                                    |
| `test/auth-basic.test.ts`          | `basicAuth`, `hashPassword`, `verifyPassword`                               |
| `test/auth-delegated.test.ts`      | `delegatedAuth`                                                             |
| `test/authorization-none.test.ts`  | `noAuthorization`                                                           |
| `test/authorization-roles.test.ts` | `rolesAuthorization`, `DEFAULT_ROLE_POLICY`, `MUTATING_ACTIONS`             |
| `test/server.test.ts`              | API routes — full request/response coverage                                 |
| `test/adapters.test.ts`            | Elysia, Hono, Bun adapters                                                  |
| `test/cli.test.ts`                 | CLI commands (`init`, `list`, `validate`, `publish`, `rollback`, `inspect`) |
| `test/openfeature.test.ts`         | Provider lifecycle, refresh, stale, failure modes                           |

---

## Testing Helpers — `@xtandard/flags/testing`

The `testing` subpath export provides in-memory fixtures for writing tests against `@xtandard/flags` without any external storage.

### `createTestPanel`

Creates an in-memory `FlagsCore` with separate source and runtime stores.

```ts
import { createTestPanel } from "@xtandard/flags/testing";

const { core, sourceStorage, runtimeStorage } = createTestPanel();

// Options:
const readonlyPanel = createTestPanel({ readonly: true });
const sharedPanel = createTestPanel({ sharedStorage: true }); // source === runtime
```

### `booleanFlag`

Build a boolean flag with `on`/`off` variants.

```ts
import { booleanFlag } from "@xtandard/flags/testing";

const flag = booleanFlag("new-dashboard", {
  enabled: true,
  default: false, // default variant: "off"
  fallthrough: { variant: "off" },
  rules: [
    {
      id: "beta",
      conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
      serve: { variant: "on" },
    },
  ],
  overrides: [{ targetingKey: "user-42", variant: "on" }],
});
```

### `variantFlag`

Build a string, number, or JSON flag from a variant map.

```ts
import { variantFlag } from "@xtandard/flags/testing";

const theme = variantFlag("theme", "string", {
  variants: { light: "light", dark: "dark", system: "system" },
  default: "light",
  enabled: true,
});

const limit = variantFlag("rate-limit", "number", {
  variants: { free: 10, pro: 100, enterprise: 1000 },
  default: "free",
});
```

### `publishFlags`

Upsert a list of flags into the draft and publish a snapshot in one call.

```ts
import { createTestPanel, booleanFlag, publishFlags } from "@xtandard/flags/testing";

const { core } = createTestPanel();

const version = await publishFlags(core, [
  booleanFlag("feature-a"),
  booleanFlag("feature-b", { enabled: false }),
]);
// version → "v1"
```

### Full Test Example

```ts
import { describe, expect, test } from "vitest";
import { OpenFeature } from "@openfeature/server-sdk";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createTestPanel, booleanFlag, publishFlags } from "@xtandard/flags/testing";

describe("feature flag evaluation", () => {
  test("returns true for a user on the pro plan", async () => {
    const { core, runtimeStorage } = createTestPanel();

    await publishFlags(core, [
      booleanFlag("new-checkout", {
        enabled: true,
        default: false,
        rules: [
          {
            id: "pro-rule",
            conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
            serve: { variant: "on" },
          },
        ],
      }),
    ]);

    const provider = createOpenFeatureProvider({
      storage: runtimeStorage,
      projectKey: "default",
      environmentKey: "production",
    });
    await OpenFeature.setProviderAndWait(provider);

    const client = OpenFeature.getClient();
    const value = await client.getBooleanValue("new-checkout", false, {
      targetingKey: "user-1",
      plan: "pro",
    });

    expect(value).toBe(true);

    await OpenFeature.close();
  });
});
```
