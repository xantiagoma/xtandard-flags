# Authentication

Authentication answers "Who is this request from?" It runs on every admin API call and resolves an identity (`Principal`) or `null` for unauthenticated requests.

---

## The `AuthProvider` Contract

```ts
import type { AuthProvider, Principal } from "@xtandard/flags/auth/none";

interface Principal {
  id: string;
  email?: string;
  name?: string;
  roles?: string[];
  metadata?: unknown;
}

interface AuthProvider {
  authenticate(request: Request): Promise<Principal | null>;
  challenge?(request: Request): Response | undefined;
}
```

`authenticate` returns `null` to signal an unauthenticated request. The server will then call `challenge` (if provided) to build a `Response` that prompts for credentials — for Basic auth this is a `401` with a `WWW-Authenticate` header. If `challenge` is not provided, the server returns a plain `401`.

---

## Built-in Providers

### No Auth — `@xtandard/flags/auth/none`

Every request is treated as the anonymous principal. No credentials required.

```ts
import { noAuth } from "@xtandard/flags/auth/none";

const auth = noAuth();
// auth.authenticate(request) → { id: "anonymous" } always
```

The anonymous principal's id is the exported `ANONYMOUS_PRINCIPAL` constant. Use `noAuth` for embedded deployments behind a VPN or mTLS, or for local development. Do not expose it publicly without an external auth layer.

---

### Basic Auth — `@xtandard/flags/auth/basic`

Parses `Authorization: Basic <base64>` headers and verifies passwords from a configured user list.

```ts
import { basicAuth, hashPassword } from "@xtandard/flags/auth/basic";

const auth = basicAuth({
  realm: "Flags Admin",
  users: [
    {
      username: "admin",
      passwordHash: process.env.FLAGS_ADMIN_PASSWORD_HASH!, // preferred
      roles: ["admin"],
      email: "admin@example.com",
    },
    {
      username: "viewer",
      passwordHash: process.env.FLAGS_VIEWER_PASSWORD_HASH!,
      roles: ["viewer"],
    },
  ],
});
```

#### Credential Modes

For each user, `basicAuth` checks credentials in this order:

1. **`passwordVerifier`** (option on `basicAuth`, not per-user) — call your own credential store.
2. **`passwordHash`** — a scrypt hash produced by `hashPassword`. Recommended for production.
3. **`password`** — plaintext. **Development only.** Never ship real credentials as plaintext.

#### `hashPassword` and `verifyPassword`

```ts
import { hashPassword, verifyPassword } from "@xtandard/flags/auth/basic";

// Generate a hash to store in config or environment variables:
const hash = await hashPassword("correct horse battery staple");
// → "scrypt$<32 hex chars>$<128 hex chars>"

// Verify later:
const ok = await verifyPassword("correct horse battery staple", hash);
// → true
```

The format is `scrypt$<saltHex>$<hashHex>`. The algorithm uses `node:crypto` `scrypt` with a 16-byte random salt and 64-byte key — available in both Node.js ≥20 and Bun. Comparisons use `crypto.timingSafeEqual`.

#### Per-user `BasicAuthUser` options

| Field              | Type                                                  | Description                                            |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------ |
| `username`         | `string`                                              | Login name                                             |
| `passwordHash`     | `string`                                              | scrypt digest from `hashPassword`. Preferred.          |
| `password`         | `string`                                              | Dev-only plaintext password.                           |
| `passwordVerifier` | `(username, password) => Promise<boolean> \| boolean` | Custom verifier on `basicAuth` options (not per user). |
| `roles`            | `string[]`                                            | Roles on the resulting `Principal`.                    |
| `email`            | `string`                                              | Email on the resulting `Principal`.                    |
| `id`               | `string`                                              | Principal id. Defaults to `username`.                  |

#### `basicAuth` options

| Option             | Type                                                  | Default            | Description                                                        |
| ------------------ | ----------------------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| `users`            | `BasicAuthUser[]`                                     | required           | The known users.                                                   |
| `realm`            | `string`                                              | `"xtandard-flags"` | Realm in the `WWW-Authenticate` header.                            |
| `passwordVerifier` | `(username, password) => Promise<boolean> \| boolean` | —                  | Custom verifier that takes precedence over per-user hash/password. |

#### The 401 / Challenge Flow

1. Request arrives without or with invalid `Authorization` header.
2. `authenticate` returns `null`.
3. Server calls `challenge(request)` → `Response { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Flags Admin"' } }`.
4. Browser shows a credential dialog.
5. On resubmit, `authenticate` verifies and returns the `Principal`.

---

### Delegated Auth — `@xtandard/flags/auth/delegated`

Wrap your own auth logic without implementing the full interface.

```ts
import { delegatedAuth } from "@xtandard/flags/auth/delegated";

const auth = delegatedAuth({
  authenticate: async (request) => {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return null;
    const payload = await verifyJwt(token);
    return payload ? { id: payload.sub, email: payload.email, roles: payload.roles } : null;
  },
  challenge: (request) =>
    new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="Flags Admin"' },
    }),
});
```

`DelegatedAuthOptions.authenticate` may be synchronous or asynchronous. `challenge` is optional — if omitted, the server returns a plain `401`.

---

## Writing a Custom Provider

Implement the `AuthProvider` interface directly:

```ts
import type { AuthProvider } from "@xtandard/flags/auth/none";

const myAuth: AuthProvider = {
  async authenticate(request) {
    const apiKey = request.headers.get("x-api-key");
    const user = apiKey ? await db.users.findByApiKey(apiKey) : null;
    return user ? { id: user.id, email: user.email, roles: user.roles } : null;
  },
  challenge(request) {
    return new Response("Unauthorized", { status: 401 });
  },
};
```

Pass it as `auth` to `flagsPanel` or `createFetchHandler`.
