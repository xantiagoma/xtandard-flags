import { describe, expect, test } from "vitest";
import type { Principal } from "../src/auth/contract.ts";
import type { AuthorizeInput, FlagsAction, FlagsResource } from "../src/authorization/contract.ts";
import {
  ALL_ACTIONS,
  DEFAULT_ROLE_POLICY,
  READ_ACTIONS,
  rolesAuthorization,
} from "../src/authorization/roles.ts";

const RESOURCE: FlagsResource = { type: "project", projectKey: "p" };

const input = (principal: Principal | null, action: FlagsAction): AuthorizeInput => ({
  principal,
  action,
  resource: RESOURCE,
  request: new Request("http://x/"),
});

const admin: Principal = { id: "a", roles: ["admin"] };
const viewer: Principal = { id: "v", roles: ["viewer"] };
const editor: Principal = { id: "e", roles: ["editor"] };

describe("rolesAuthorization (default policy)", () => {
  const authz = rolesAuthorization();

  test("admin is allowed everything", async () => {
    for (const action of ALL_ACTIONS) {
      expect(await authz.authorize(input(admin, action))).toBe(true);
    }
  });

  test("viewer is allowed reads", async () => {
    for (const action of READ_ACTIONS) {
      expect(await authz.authorize(input(viewer, action))).toBe(true);
    }
  });

  test("viewer is denied writes", async () => {
    expect(await authz.authorize(input(viewer, "flag:update"))).toBe(false);
    expect(await authz.authorize(input(viewer, "project:create"))).toBe(false);
    expect(await authz.authorize(input(viewer, "snapshot:publish"))).toBe(false);
  });

  test("editor is allowed writes", async () => {
    expect(await authz.authorize(input(editor, "flag:update"))).toBe(true);
    expect(await authz.authorize(input(editor, "snapshot:publish"))).toBe(true);
  });
});

describe("rolesAuthorization (readonly)", () => {
  const authz = rolesAuthorization({ readonly: true });

  test("blocks mutating actions even for admin", async () => {
    expect(await authz.authorize(input(admin, "flag:update"))).toBe(false);
    expect(await authz.authorize(input(admin, "snapshot:rollback"))).toBe(false);
  });

  test("still allows reads for authorized roles", async () => {
    expect(await authz.authorize(input(admin, "flag:read"))).toBe(true);
    expect(await authz.authorize(input(viewer, "audit:read"))).toBe(true);
  });
});

describe("rolesAuthorization (custom policy)", () => {
  test("honors an explicit action list", async () => {
    const authz = rolesAuthorization({
      policy: { ops: ["snapshot:publish", "snapshot:read"] },
    });
    const ops: Principal = { id: "o", roles: ["ops"] };
    expect(await authz.authorize(input(ops, "snapshot:publish"))).toBe(true);
    expect(await authz.authorize(input(ops, "flag:update"))).toBe(false);
  });

  test("DEFAULT_ROLE_POLICY exposes admin/editor/viewer", () => {
    expect(DEFAULT_ROLE_POLICY.admin).toBe("*");
    expect(DEFAULT_ROLE_POLICY.viewer).toEqual([...READ_ACTIONS]);
  });
});
