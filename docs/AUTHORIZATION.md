# Authorization

Authorization answers "Can this principal perform this action on this resource?" It runs after authentication on every mutating admin API call.

---

## The `AuthorizationProvider` Contract

```ts
import type { AuthorizationProvider, AuthorizeInput } from "@xtandard/flags/authorization/none";

interface AuthorizeInput {
  principal: Principal | null;
  action: FlagsAction;
  resource: FlagsResource;
  request: Request;
}

interface AuthorizationProvider {
  authorize(input: AuthorizeInput): Promise<boolean>;
}
```

Return `true` to allow, `false` to deny. The server returns `403` on denial.

---

## `FlagsAction` — Full List

| Action               | Triggered by                                                  |
| -------------------- | ------------------------------------------------------------- |
| `project:read`       | `GET /api/projects`                                           |
| `project:create`     | `POST /api/projects`                                          |
| `project:update`     | (reserved)                                                    |
| `project:delete`     | (reserved)                                                    |
| `environment:read`   | `GET /api/projects/:p/environments`                           |
| `environment:create` | `POST /api/projects/:p/environments`                          |
| `environment:update` | (reserved)                                                    |
| `environment:delete` | (reserved)                                                    |
| `flag:read`          | `GET .../flags`, `GET .../flags/:key`, `GET .../draft`        |
| `flag:create`        | `POST .../flags`                                              |
| `flag:update`        | `PUT .../flags/:key`, `PUT .../draft`                         |
| `flag:delete`        | `DELETE .../flags/:key`                                       |
| `snapshot:read`      | `GET .../snapshots`, `GET .../snapshots/:v`, `GET .../active` |
| `snapshot:publish`   | `POST .../publish`                                            |
| `snapshot:rollback`  | `POST .../rollback`                                           |
| `audit:read`         | `GET .../audit`                                               |

## `FlagsResource` — Full List

```ts
type FlagsResource =
  | { type: "project"; projectKey: string }
  | { type: "environment"; projectKey: string; environmentKey: string }
  | { type: "flag"; projectKey: string; environmentKey: string; flagKey: string }
  | { type: "snapshot"; projectKey: string; environmentKey: string; version?: string }
  | { type: "audit"; projectKey: string; environmentKey?: string };
```

## `MUTATING_ACTIONS`

The set of actions that modify state. Imported from `@xtandard/flags`:

```ts
import { MUTATING_ACTIONS } from "@xtandard/flags";
// Set: project:create, project:update, project:delete,
//       environment:create, environment:update, environment:delete,
//       flag:create, flag:update, flag:delete,
//       snapshot:publish, snapshot:rollback
```

---

## Built-in Providers

### No Authorization — `@xtandard/flags/authorization/none`

Every action is allowed, regardless of principal or resource.

```ts
import { noAuthorization } from "@xtandard/flags/authorization/none";

const authz = noAuthorization();
// authz.authorize(input) → true, always
```

Correct for embedded usage with no public-facing admin surface. Do not use it on a network-exposed admin if untrusted users can reach it.

---

### Roles Authorization — `@xtandard/flags/authorization/roles`

Maps role names to `FlagsAction` sets. The principal's `roles` array (set by the `AuthProvider`) is used to look up grants. The action is allowed if **any** role grants it.

```ts
import { rolesAuthorization } from "@xtandard/flags/authorization/roles";

// Use the built-in admin/editor/viewer policy:
const authz = rolesAuthorization();

// Custom policy:
const custom = rolesAuthorization({
  policy: {
    ops: ["snapshot:publish", "snapshot:rollback", "snapshot:read"],
    auditor: ["audit:read"],
    developer: ["flag:read", "flag:create", "flag:update", "flag:delete"],
  },
});
```

#### Default Role Policy

When `policy` is omitted, the built-in `DEFAULT_ROLE_POLICY` applies:

| Role     | Grants                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| `admin`  | `"*"` — every action                                                           |
| `editor` | Every action (explicit list, same reach as admin)                              |
| `viewer` | `project:read`, `environment:read`, `flag:read`, `snapshot:read`, `audit:read` |

#### Policy Shape

```ts
type RolePolicy = Record<string, FlagsAction[] | "*">;
```

`"*"` is a wildcard granting every action. An explicit array lists the exact actions the role grants.

#### `readonly` Mode

The `readonly` switch in `RolesAuthorizationOptions` denies all mutating actions regardless of role:

```ts
const authz = rolesAuthorization({ readonly: true });
// Blocks: project:create/update/delete, environment:create/update/delete,
//         flag:create/update/delete, snapshot:publish, snapshot:rollback
// Allows: all *:read actions (if the principal's role grants them)
```

This is independent of the `readonly` flag on `FlagsPanelOptions` / `createFlagsCore`, which blocks at the core level. Use `rolesAuthorization({ readonly: true })` when you want the API to reject mutating requests with `403` rather than silently failing.

#### Decision Order

1. If `readonly` is `true` and the action is in `MUTATING_ACTIONS` → **deny**.
2. If `principal` is `null` → **deny**.
3. If any of the principal's roles grants the action → **allow**; otherwise **deny**.

---

### Delegated Authorization — `@xtandard/flags/authorization/delegated`

Wrap any policy logic — ABAC, an external OPA/Cedar engine, per-project ownership:

```ts
import { delegatedAuthorization } from "@xtandard/flags/authorization/delegated";

const authz = delegatedAuthorization({
  authorize: async ({ principal, action, resource, request }) => {
    // Only allow reads for the "viewer" role
    if (principal?.roles?.includes("viewer")) {
      return action.endsWith(":read");
    }
    // Allow anything for admins
    if (principal?.roles?.includes("admin")) {
      return true;
    }
    return false;
  },
});
```

The `authorize` callback may be synchronous or asynchronous.

---

## Writing a Custom Provider

```ts
import type { AuthorizationProvider } from "@xtandard/flags/authorization/none";

const myAuthz: AuthorizationProvider = {
  async authorize({ principal, action, resource }) {
    if (!principal) return false;
    // Fetch permissions from your own store
    const perms = await db.permissions.get(principal.id);
    return perms.includes(action);
  },
};
```

Pass it as `authorization` to `flagsPanel` or `createFetchHandler`.
