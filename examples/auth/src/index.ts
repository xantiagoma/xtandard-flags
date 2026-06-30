/**
 * Auth + authorization flexibility demo. One server; `AUTH_DEMO` selects the mode:
 *
 *   AUTH_DEMO=none|basic|header|query|cookie|jwt|rbac bun run src/index.ts
 *
 * `none` (default open), `basic` (hashed + plaintext passwords), four toy custom
 * AuthProviders (header / query / cookie / JWT), and `rbac` (three users with
 * different permissions). See ../README.md for curl commands per mode.
 */
import { createFetchHandler } from "@xtandard/flags";
import type { AuthProvider, AuthorizationProvider, FlagsAction } from "@xtandard/flags";
import { createMemoryStorage } from "@xtandard/flags/storage/memory";
import { noAuth } from "@xtandard/flags/auth/none";
import { basicAuth, hashPassword } from "@xtandard/flags/auth/basic";
import { noAuthorization } from "@xtandard/flags/authorization/none";
import { rolesAuthorization, type RolePolicy } from "@xtandard/flags/authorization/roles";
import { cookieAuth, headerTokenAuth, jwtAuth, queryTokenAuth, signJwt } from "./providers.ts";

const JWT_SECRET = "demo-secret-change-me";

// A 3-tier role policy: admin → anything; editor → edit flags but NOT publish or
// delete; viewer → read only. Authorization allows an action if ANY of the
// principal's roles grants it.
const READ_ONLY: FlagsAction[] = [
  "project:read",
  "environment:read",
  "flag:read",
  "snapshot:read",
  "audit:read",
];
const POLICY: RolePolicy = {
  admin: "*",
  editor: ["flag:read", "flag:create", "flag:update", "snapshot:read", "audit:read"],
  viewer: READ_ONLY,
};

const mode = process.env.AUTH_DEMO ?? "rbac";
let auth: AuthProvider;
let authorization: AuthorizationProvider = rolesAuthorization({ policy: POLICY });

switch (mode) {
  case "none":
    auth = noAuth();
    authorization = noAuthorization(); // allow everything
    break;
  case "basic":
    auth = basicAuth({
      users: [
        // Encrypted (scrypt) — preferred. The stored value is a `scrypt$…` digest.
        { username: "admin", passwordHash: await hashPassword("s3cret"), roles: ["admin"] },
        // Plaintext — DEV ONLY. Never ship a real password as cleartext.
        { username: "dev", password: "dev", roles: ["admin"] },
      ],
    });
    break;
  case "header":
    auth = headerTokenAuth();
    break;
  case "query":
    auth = queryTokenAuth();
    break;
  case "cookie":
    auth = cookieAuth();
    break;
  case "jwt":
    auth = jwtAuth(JWT_SECRET);
    break;
  case "rbac":
    auth = basicAuth({
      users: [
        { username: "alice", passwordHash: await hashPassword("alice"), roles: ["admin"] },
        { username: "bob", passwordHash: await hashPassword("bob"), roles: ["editor"] },
        { username: "carol", passwordHash: await hashPassword("carol"), roles: ["viewer"] },
      ],
    });
    break;
  default:
    console.error(`Unknown AUTH_DEMO="${mode}". Use: none|basic|header|query|cookie|jwt|rbac`);
    process.exit(1);
}

const panel = createFetchHandler({
  basePath: "",
  sourceStorage: createMemoryStorage(),
  title: `Auth demo: ${mode}`,
  auth,
  authorization,
});

const port = Number(process.env.PORT) || 3000;
Bun.serve({ port, fetch: panel.fetch });

const flags = `http://localhost:${port}/api/projects/default/environments/production/flags`;
console.log(`▶ auth demo "${mode}" on http://localhost:${port}\n`);

if (mode === "jwt") {
  console.log("Sample tokens (Authorization: Bearer <token>):");
  for (const u of [
    { sub: "alice", roles: ["admin"] },
    { sub: "bob", roles: ["editor"] },
    { sub: "carol", roles: ["viewer"] },
  ]) {
    const token = signJwt({ ...u, exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET);
    console.log(`  ${u.sub} (${u.roles.join(",")}): ${token}\n`);
  }
}

console.log(`Try it (read flags should differ by who you are):\n  curl -s ${flags}`);
