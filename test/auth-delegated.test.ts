import { describe, expect, test } from "vitest";
import { delegatedAuth } from "../src/auth/delegated.ts";
import type { Principal } from "../src/auth/contract.ts";

describe("delegatedAuth", () => {
  test("returns the principal from the delegate", async () => {
    const principal: Principal = { id: "u-1", roles: ["admin"] };
    const auth = delegatedAuth({ authenticate: () => principal });
    expect(await auth.authenticate(new Request("http://x/"))).toEqual(principal);
  });

  test("returns null from the delegate", async () => {
    const auth = delegatedAuth({ authenticate: () => null });
    expect(await auth.authenticate(new Request("http://x/"))).toBeNull();
  });

  test("normalizes an async delegate", async () => {
    const auth = delegatedAuth({
      authenticate: async () => ({ id: "async-user" }),
    });
    expect(await auth.authenticate(new Request("http://x/"))).toEqual({ id: "async-user" });
  });

  test("forwards an optional challenge", () => {
    const challenge = () => new Response("nope", { status: 401 });
    const auth = delegatedAuth({ authenticate: () => null, challenge });
    expect(auth.challenge).toBeDefined();
    expect(auth.challenge?.(new Request("http://x/"))?.status).toBe(401);
  });

  test("omits challenge when not provided", () => {
    const auth = delegatedAuth({ authenticate: () => null });
    expect(auth.challenge).toBeUndefined();
  });
});
