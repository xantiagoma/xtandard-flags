import { describe, expect, test } from "vitest";
import { basicAuth } from "../src/auth/basic.ts";

describe("basicAuth (flags defaults)", () => {
  test("challenge() defaults the realm to xtandard-flags", () => {
    const auth = basicAuth({ users: [{ username: "admin", password: "secret" }] });
    const response = auth.challenge?.(new Request("http://x/"));
    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toBe('Basic realm="xtandard-flags"');
  });

  test("an explicit realm wins", () => {
    const auth = basicAuth({
      users: [{ username: "admin", password: "secret" }],
      realm: "Flags Admin",
    });
    const response = auth.challenge?.(new Request("http://x/"));
    expect(response?.headers.get("WWW-Authenticate")).toBe('Basic realm="Flags Admin"');
  });
});
