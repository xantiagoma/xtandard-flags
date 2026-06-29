import { describe, expect, test } from "vitest";
import { ANONYMOUS_PRINCIPAL, noAuth } from "../src/auth/none.ts";

describe("noAuth", () => {
  test("resolves every request to the anonymous principal", async () => {
    const auth = noAuth();
    const principal = await auth.authenticate(new Request("http://x/"));
    expect(principal).toEqual({ id: "anonymous" });
    expect(principal).toBe(ANONYMOUS_PRINCIPAL);
  });

  test("never returns null", async () => {
    const auth = noAuth();
    const request = new Request("http://x/", {
      headers: { Authorization: "Basic " + btoa("whoever:whatever") },
    });
    expect(await auth.authenticate(request)).not.toBeNull();
  });

  test("does not provide a challenge", () => {
    expect(noAuth().challenge).toBeUndefined();
  });
});
