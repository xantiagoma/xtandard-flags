import { describe, expect, test } from "vitest";
import type { AuthorizeInput, FlagsAction } from "../src/authorization/contract.ts";
import { noAuthorization } from "../src/authorization/none.ts";

const input = (action: FlagsAction): AuthorizeInput => ({
  principal: null,
  action,
  resource: { type: "project", projectKey: "p" },
  request: new Request("http://x/"),
});

describe("noAuthorization", () => {
  const authz = noAuthorization();

  test("allows reads", async () => {
    expect(await authz.authorize(input("flag:read"))).toBe(true);
  });

  test("allows mutating actions", async () => {
    expect(await authz.authorize(input("flag:delete"))).toBe(true);
    expect(await authz.authorize(input("snapshot:publish"))).toBe(true);
  });

  test("allows even with a null principal", async () => {
    expect(await authz.authorize(input("project:create"))).toBe(true);
  });
});
