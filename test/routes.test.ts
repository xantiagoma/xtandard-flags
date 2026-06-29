import { describe, expect, test } from "vitest";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import type { AuthorizationProvider } from "../src/authorization/contract.ts";
import { booleanFlag, themeFlag } from "./fixtures.ts";

const panel = (
  opts: Partial<Parameters<typeof createFetchHandler>[0]> = {},
): ReturnType<typeof createFetchHandler> =>
  createFetchHandler({ sourceStorage: createMemoryStorage(), ...opts } as Parameters<
    typeof createFetchHandler
  >[0]);

const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

const BASE = "/api/projects/default/environments/production";

describe("routes — projects & environments", () => {
  test("GET /api/projects auto-creates default and lists it", async () => {
    const { fetch } = panel();
    const res = await fetch(req("GET", "/api/projects"));
    expect(res.status).toBe(200);
    const projects = await res.json();
    expect(projects.some((p: { key: string }) => p.key === "default")).toBe(true);
  });

  test("POST /api/projects creates a project (201)", async () => {
    const { fetch } = panel();
    const res = await fetch(req("POST", "/api/projects", { key: "billing", name: "Billing" }));
    expect(res.status).toBe(201);
    expect((await res.json()).key).toBe("billing");
  });

  test("GET environments auto-creates default env and lists", async () => {
    const { fetch } = panel();
    const res = await fetch(req("GET", "/api/projects/default/environments"));
    expect(res.status).toBe(200);
    const envs = await res.json();
    expect(envs.some((e: { key: string }) => e.key === "production")).toBe(true);
  });

  test("POST environments creates a new environment (201)", async () => {
    const { fetch } = panel();
    const res = await fetch(
      req("POST", "/api/projects/default/environments", { key: "staging", name: "Staging" }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).key).toBe("staging");
  });
});

describe("routes — single flag", () => {
  test("GET a present flag returns it", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    const res = await fetch(req("GET", `${BASE}/flags/theme`));
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe("theme");
  });

  test("GET a missing flag returns 404", async () => {
    const { fetch } = panel();
    const res = await fetch(req("GET", `${BASE}/flags/nope`));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("nope");
  });

  test("PUT updates a flag and forces the key", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    const res = await fetch(
      req("PUT", `${BASE}/flags/theme`, themeFlag({ key: "ignored", defaultVariant: "xmas" })),
    );
    expect(res.status).toBe(200);
    const flag = await res.json();
    expect(flag.key).toBe("theme");
    expect(flag.defaultVariant).toBe("xmas");
  });

  test("DELETE removes a present flag", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    const res = await fetch(req("DELETE", `${BASE}/flags/theme`));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const after = await fetch(req("GET", `${BASE}/flags/theme`));
    expect(after.status).toBe(404);
  });

  test("DELETE of a missing flag maps to 404", async () => {
    const { fetch } = panel();
    const res = await fetch(req("DELETE", `${BASE}/flags/ghost`));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("ghost");
  });
});

describe("routes — draft", () => {
  test("GET draft returns an (empty) draft", async () => {
    const { fetch } = panel();
    const res = await fetch(req("GET", `${BASE}/draft`));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.projectKey).toBe("default");
    expect(d.environmentKey).toBe("production");
    expect(d.flags).toEqual({});
  });

  test("PUT draft replaces the whole draft", async () => {
    const { fetch } = panel();
    const res = await fetch(
      req("PUT", `${BASE}/draft`, {
        projectKey: "default",
        environmentKey: "production",
        flags: { theme: themeFlag() },
      }),
    );
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()).flags)).toEqual(["theme"]);
  });

  test("PUT an invalid draft → 422 VALIDATION", async () => {
    const { fetch } = panel();
    const res = await fetch(
      req("PUT", `${BASE}/draft`, {
        projectKey: "default",
        environmentKey: "production",
        flags: { theme: themeFlag({ defaultVariant: "missing" }) },
      }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("VALIDATION");
  });
});

describe("routes — snapshots & active", () => {
  test("GET a specific snapshot version", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    await fetch(req("POST", `${BASE}/publish`, { message: "m" }));
    const res = await fetch(req("GET", `${BASE}/snapshots/v1`));
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBe("v1");
  });

  test("GET a missing snapshot version → 404", async () => {
    const { fetch } = panel();
    const res = await fetch(req("GET", `${BASE}/snapshots/v99`));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("v99");
  });

  test("GET active before any publish returns null body", async () => {
    const { fetch } = panel();
    const res = await fetch(req("GET", `${BASE}/active`));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});

describe("routes — audit", () => {
  test("GET audit lists publish entries", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    await fetch(req("POST", `${BASE}/publish`, { message: "first" }));
    const res = await fetch(req("GET", `${BASE}/audit`));
    expect(res.status).toBe(200);
    const audit = await res.json();
    expect(audit.length).toBe(1);
    expect(audit[0].action).toBe("publish");
  });
});

describe("routes — evaluate", () => {
  test("evaluate all flags against a context (draft source)", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    await fetch(req("POST", `${BASE}/flags`, booleanFlag()));
    const res = await fetch(req("POST", `${BASE}/evaluate`, { context: { targetingKey: "u1" } }));
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results.length).toBe(2);
  });

  test("evaluate a single flagKey", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    await fetch(req("POST", `${BASE}/flags`, booleanFlag()));
    const res = await fetch(
      req("POST", `${BASE}/evaluate`, { flagKey: "theme", context: {} }),
    );
    const { results } = await res.json();
    expect(results.length).toBe(1);
    expect(results[0].key).toBe("theme");
  });

  test("evaluate against the active snapshot source", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    await fetch(req("POST", `${BASE}/publish`));
    const res = await fetch(req("POST", `${BASE}/evaluate`, { source: "active", context: {} }));
    const { results } = await res.json();
    expect(results.length).toBe(1);
  });

  test("evaluate with no body defaults context to {}", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    const res = await fetch(req("POST", `${BASE}/evaluate`, {}));
    expect(res.status).toBe(200);
  });
});

describe("routes — error mappings", () => {
  test("invalid JSON body → 400", async () => {
    const { fetch } = panel();
    const res = await fetch(
      new Request(`http://localhost${BASE}/flags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid JSON");
  });

  test("validation error → 422 with code VALIDATION", async () => {
    const { fetch } = panel();
    const res = await fetch(req("POST", `${BASE}/flags`, themeFlag({ defaultVariant: "ghost" })));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  test("readonly mutation → 403 with code READONLY", async () => {
    const { fetch } = panel({ readonly: true });
    const res = await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("READONLY");
  });

  test("rollback to a missing version → 404 (NotFound)", async () => {
    const { fetch } = panel();
    const res = await fetch(req("POST", `${BASE}/rollback`, { version: "v42" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("v42");
  });

  test("unknown /api route → 404", async () => {
    const { fetch } = panel();
    const res = await fetch(req("GET", "/api/nonexistent"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Not found");
  });

  test("publish with a non-JSON body still works (catch → undefined message)", async () => {
    const { fetch } = panel();
    await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    const res = await fetch(
      new Request(`http://localhost${BASE}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "",
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("routes — authentication & authorization", () => {
  test("/config reports unauthenticated when auth returns null", async () => {
    const { fetch } = panel({
      auth: { authenticate: async () => null },
    });
    const cfg = await (await fetch(req("GET", "/config"))).json();
    expect(cfg.authenticated).toBe(false);
    expect(cfg.principal).toBeNull();
  });

  test("auth that throws is treated as unauthenticated (401 without challenge)", async () => {
    const { fetch } = panel({
      auth: {
        authenticate: async () => {
          throw new Error("boom");
        },
      },
    });
    const res = await fetch(req("GET", "/api/projects"));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  test("authorization denial for a specific action → 403 with action", async () => {
    const authorization: AuthorizationProvider = {
      authorize: async ({ action }) => action !== "flag:create",
    };
    const { fetch } = panel({ authorization });
    // reads allowed
    expect((await fetch(req("GET", `${BASE}/flags`))).status).toBe(200);
    // create denied
    const res = await fetch(req("POST", `${BASE}/flags`, themeFlag()));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(body.action).toBe("flag:create");
  });

  test("authorization denial blocks each remaining endpoint", async () => {
    const denyAll: AuthorizationProvider = { authorize: async () => false };
    const { fetch } = panel({ authorization: denyAll });
    const cases: [string, string, unknown?][] = [
      ["GET", "/api/projects"],
      ["POST", "/api/projects", { key: "p" }],
      ["GET", "/api/projects/default/environments"],
      ["POST", "/api/projects/default/environments", { key: "e" }],
      ["POST", `${BASE}/flags`, themeFlag()],
      ["GET", `${BASE}/flags/theme`],
      ["PUT", `${BASE}/flags/theme`, themeFlag()],
      ["DELETE", `${BASE}/flags/theme`],
      ["GET", `${BASE}/draft`],
      ["PUT", `${BASE}/draft`, { projectKey: "default", environmentKey: "production", flags: {} }],
      ["POST", `${BASE}/publish`, {}],
      ["POST", `${BASE}/rollback`, { version: "v1" }],
      ["GET", `${BASE}/snapshots`],
      ["GET", `${BASE}/snapshots/v1`],
      ["GET", `${BASE}/active`],
      ["GET", `${BASE}/audit`],
      ["POST", `${BASE}/evaluate`, { context: {} }],
    ];
    for (const [method, path, body] of cases) {
      const res = await fetch(req(method, path, body));
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });
});

describe("routes — method handling", () => {
  test("non-GET to a static path → 405", async () => {
    const { fetch } = panel();
    const res = await fetch(req("POST", "/some/non-api/path", undefined, {}));
    expect(res.status).toBe(405);
  });
});
