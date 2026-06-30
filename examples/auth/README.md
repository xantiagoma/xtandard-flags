# Auth & authorization — how flexible it is

Authentication ("who is this request?") and authorization ("may they do it?") are
two small **pluggable contracts**. This one example mounts the panel with a
different setup per `AUTH_DEMO` mode so you can see them all.

```bash
bun install
AUTH_DEMO=rbac bun run start    # default; modes below
# or from the repo root:  bun run examples:auth
```

| `AUTH_DEMO` | Authentication | Notes                                                                          |
| ----------- | -------------- | ------------------------------------------------------------------------------ |
| `none`      | none (open)    | every request is the anonymous principal; paired with `noAuthorization()`      |
| `basic`     | HTTP Basic     | one user with an **encrypted** (scrypt) password, one with **plaintext** (dev) |
| `header`    | custom         | `X-API-Key: <token>`                                                           |
| `query`     | custom         | `?token=<token>`                                                               |
| `cookie`    | custom         | `session=<token>` cookie                                                       |
| `jwt`       | custom         | `Authorization: Bearer <HS256 JWT>` (prints sample tokens)                     |
| `rbac`      | Basic, 3 users | demonstrates **authorization**: admin / editor / viewer                        |

The custom providers ([`src/providers.ts`](./src/providers.ts)) are ~5 lines each —
an `AuthProvider` just maps a `Request` → `Principal | null`. Roles on the
principal drive the authorization policy.

## Authentication examples

```bash
# none — anything works
AUTH_DEMO=none bun run start
curl -s localhost:3000/api/projects/default/environments/production/flags        # 200

# basic — encrypted (admin/s3cret) or plaintext (dev/dev)
AUTH_DEMO=basic bun run start
curl -su admin:s3cret  localhost:3000/api/.../flags     # 200
curl -su admin:wrong   localhost:3000/api/.../flags     # 401

# header / query / cookie — tokens: tok-admin | tok-editor | tok-viewer
AUTH_DEMO=header bun run start
curl -s -H 'x-api-key: tok-admin' localhost:3000/api/.../flags         # 200
AUTH_DEMO=query  bun run start
curl -s 'localhost:3000/api/.../flags?token=tok-admin'                 # 200
AUTH_DEMO=cookie bun run start
curl -s -H 'cookie: session=tok-admin' localhost:3000/api/.../flags    # 200

# jwt — the server prints signed sample tokens on startup
AUTH_DEMO=jwt bun run start
curl -s -H "authorization: Bearer <printed-token>" localhost:3000/api/.../flags  # 200
```

## Authorization example (`rbac`)

Three users, one role each, with this policy (admin = anything, editor = edit flags
but **not** publish/delete, viewer = read-only):

```ts
rolesAuthorization({
  policy: {
    admin: "*",
    editor: ["flag:read", "flag:create", "flag:update", "snapshot:read", "audit:read"],
    viewer: ["project:read", "environment:read", "flag:read", "snapshot:read", "audit:read"],
  },
});
```

```bash
AUTH_DEMO=rbac bun run start
API=localhost:3000/api/projects/default/environments/production

curl -so/dev/null -w '%{http_code}\n'           $API/flags          # 401  (no creds)
curl -so/dev/null -w '%{http_code}\n' -u carol:carol $API/flags     # 200  viewer can read
curl -so/dev/null -w '%{http_code}\n' -u carol:carol -X PUT $API/flags/x -d '{...}'   # 403  viewer can't write
curl -so/dev/null -w '%{http_code}\n' -u bob:bob     -X PUT $API/flags/x -d '{...}'   # 200  editor can edit
curl -so/dev/null -w '%{http_code}\n' -u bob:bob     -X POST $API/publish -d '{}'     # 403  editor can't publish
curl -so/dev/null -w '%{http_code}\n' -u alice:alice -X POST $API/publish -d '{}'     # 201  admin can
```

(All verified — these exact status codes are what the example returns.)

## In your own app

```ts
import { createFetchHandler } from "@xtandard/flags";
import { basicAuth } from "@xtandard/flags/auth/basic";
import { rolesAuthorization } from "@xtandard/flags/authorization/roles";

createFetchHandler({
  sourceStorage,
  auth: basicAuth({ users: [{ username: "admin", passwordHash, roles: ["admin"] }] }),
  authorization: rolesAuthorization({ policy: { admin: "*" } }),
});
```

Generate a password hash: `bun -e "import('@xtandard/flags/auth/basic').then(m => m.hashPassword('pw').then(console.log))"`.
Both contracts also have a `delegated` built-in (`auth/delegated`, `authorization/delegated`)
to call out to your own service. See [docs/AUTH.md](../../docs/AUTH.md) and
[docs/AUTHORIZATION.md](../../docs/AUTHORIZATION.md).
