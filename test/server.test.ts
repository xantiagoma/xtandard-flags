import { describe, expect, test } from "vitest";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { basicAuth, hashPassword } from "../src/auth/basic.ts";
import { rolesAuthorization } from "../src/authorization/roles.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, themeFlag } from "./fixtures.ts";

const panel = (opts: Parameters<typeof createFetchHandler>[0] extends infer O ? Partial<O> : never = {}) =>
  createFetchHandler({ sourceStorage: createMemoryStorage(), ...opts } as Parameters<typeof createFetchHandler>[0]);

const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

describe("server — bootstrap & static", () => {
  test("GET /config returns bootstrap config", async () => {
    const { fetch } = panel({ title: "My Flags" });
    const res = await fetch(req("GET", "/config"));
    expect(res.status).toBe(200);
    const cfg = await res.json();
    expect(cfg.title).toBe("My Flags");
    expect(cfg.defaultProjectKey).toBe("default");
  });

  test("unknown route falls back to SPA index.html", async () => {
    const { fetch } = panel();
    const res = await fetch(req("GET", "/some/spa/route"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("__FLAGS_CONFIG__");
  });

  test("a missing asset path 404s instead of serving the SPA", async () => {
    const { fetch } = panel();
    const res = await fetch(req("GET", "/assets/missing.js"));
    expect(res.status).toBe(404);
  });
});

describe("server — flags CRUD & publish", () => {
  test("create, list, publish, and read active snapshot", async () => {
    const { fetch } = panel();
    const base = "/api/projects/default/environments/production";

    const created = await fetch(req("POST", `${base}/flags`, themeFlag()));
    expect(created.status).toBe(201);

    const list = await fetch(req("GET", `${base}/flags`));
    expect((await list.json()).length).toBe(1);

    const pub = await fetch(req("POST", `${base}/publish`, { message: "first" }));
    expect(pub.status).toBe(201);
    expect((await pub.json()).version).toBe("v1");

    const active = await fetch(req("GET", `${base}/active`));
    expect((await active.json()).flags.theme).toBeDefined();

    const snaps = await fetch(req("GET", `${base}/snapshots`));
    expect(await snaps.json()).toMatchObject({ versions: ["v1"], active: "v1" });
  });

  test("rollback re-points active version", async () => {
    const { fetch } = panel();
    const base = "/api/projects/default/environments/production";
    await fetch(req("POST", `${base}/flags`, themeFlag()));
    await fetch(req("POST", `${base}/publish`));
    await fetch(req("POST", `${base}/flags`, booleanFlag()));
    await fetch(req("POST", `${base}/publish`));
    const rb = await fetch(req("POST", `${base}/rollback`, { version: "v1" }));
    expect(rb.status).toBe(200);
    const snaps = await fetch(req("GET", `${base}/snapshots`));
    expect((await snaps.json()).active).toBe("v1");
  });

  test("invalid flag is rejected with 422", async () => {
    const { fetch } = panel();
    const base = "/api/projects/default/environments/production";
    const res = await fetch(req("POST", `${base}/flags`, themeFlag({ defaultVariant: "ghost" })));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("VALIDATION");
  });
});

describe("server — readonly mode", () => {
  test("blocks mutations with 403 but allows reads", async () => {
    const { fetch } = panel({ readonly: true });
    const base = "/api/projects/default/environments/production";
    const write = await fetch(req("POST", `${base}/flags`, themeFlag()));
    expect(write.status).toBe(403);
    const read = await fetch(req("GET", `${base}/flags`));
    expect(read.status).toBe(200);
  });
});

describe("server — auth & authorization", () => {
  test("basic auth challenges unauthenticated API requests", async () => {
    const { fetch } = panel({
      auth: basicAuth({ users: [{ username: "admin", password: "secret", roles: ["admin"] }] }),
      authorization: rolesAuthorization({}),
    });
    const res = await fetch(req("GET", "/api/projects"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");
  });

  test("authenticated admin can read; viewer cannot write", async () => {
    const hash = await hashPassword("secret");
    const { fetch } = panel({
      auth: basicAuth({
        users: [
          { username: "admin", passwordHash: hash, roles: ["admin"] },
          { username: "view", password: "v", roles: ["viewer"] },
        ],
      }),
      authorization: rolesAuthorization({}),
    });
    const base = "/api/projects/default/environments/production";
    const adminHeader = { Authorization: "Basic " + btoa("admin:secret") };
    const viewHeader = { Authorization: "Basic " + btoa("view:v") };

    const adminWrite = await fetch(req("POST", `${base}/flags`, themeFlag(), adminHeader));
    expect(adminWrite.status).toBe(201);

    const viewRead = await fetch(req("GET", `${base}/flags`, undefined, viewHeader));
    expect(viewRead.status).toBe(200);

    const viewWrite = await fetch(req("POST", `${base}/flags`, booleanFlag(), viewHeader));
    expect(viewWrite.status).toBe(403);
  });
});

describe("server — basePath", () => {
  test("serves under a mount prefix", async () => {
    const { fetch } = panel({ basePath: "/flags" });
    const res = await fetch(req("GET", "/flags/config"));
    expect(res.status).toBe(200);
    const cfg = await res.json();
    expect(cfg.basePath).toBe("/flags");
  });
});
