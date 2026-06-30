/**
 * Toy custom {@link AuthProvider}s — each is ~5 lines, showing how little it
 * takes to bring your own authentication. An `AuthProvider` just turns a
 * web-standard `Request` into a `Principal` (or `null`). Roles on the principal
 * drive authorization.
 *
 * These are intentionally minimal demos — for real JWTs use a library like
 * `jose`; for sessions use your real session store.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthProvider, Principal } from "@xtandard/flags";

/** Demo token → principal table shared by the header/query/cookie examples. */
export const DEMO_TOKENS: Record<string, Principal> = {
  "tok-admin": { id: "alice", name: "Alice", roles: ["admin"] },
  "tok-editor": { id: "bob", name: "Bob", roles: ["editor"] },
  "tok-viewer": { id: "carol", name: "Carol", roles: ["viewer"] },
};

/** Custom auth: an `X-API-Key: <token>` header. */
export function headerTokenAuth(tokens = DEMO_TOKENS): AuthProvider {
  return {
    async authenticate(req) {
      const token = req.headers.get("x-api-key");
      return token ? (tokens[token] ?? null) : null;
    },
  };
}

/** Custom auth: a `?token=<token>` query parameter. */
export function queryTokenAuth(tokens = DEMO_TOKENS): AuthProvider {
  return {
    async authenticate(req) {
      const token = new URL(req.url).searchParams.get("token");
      return token ? (tokens[token] ?? null) : null;
    },
  };
}

/** Custom auth: a `session=<token>` cookie. */
export function cookieAuth(tokens = DEMO_TOKENS): AuthProvider {
  return {
    async authenticate(req) {
      const match = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)session=([^;]+)/);
      const token = match?.[1];
      return token ? (tokens[token] ?? null) : null;
    },
  };
}

// --- Minimal HS256 JWT (toy — use `jose` or similar in production). ---

const b64url = (b: Buffer | string): string =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Sign a demo HS256 JWT so the example/README can hand out test tokens. */
export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

/** Custom auth: an `Authorization: Bearer <HS256 JWT>` token. */
export function jwtAuth(secret: string): AuthProvider {
  return {
    async authenticate(req) {
      const header = req.headers.get("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const [h, p, sig] = token.split(".");
      if (!h || !p || !sig) return null;
      const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
      const got = b64urlDecode(sig);
      if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
      const claims = JSON.parse(b64urlDecode(p).toString()) as {
        sub?: string;
        name?: string;
        roles?: string[];
        exp?: number;
      };
      if (claims.exp && Date.now() / 1000 > claims.exp) return null;
      return { id: claims.sub ?? "unknown", name: claims.name, roles: claims.roles ?? [] };
    },
  };
}
