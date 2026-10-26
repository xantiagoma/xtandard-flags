// Runs in the `elysia2` vitest project: `elysia` → the elysia-v2 devDep alias
// (see vite.config.ts + tsconfig.elysia2.json). Elysia 2's Eden is `@elysia/eden`.
import { describe, expect, test } from "vitest";
import { Elysia, t } from "elysia";
import { treaty } from "@elysia/eden";
import { flagsElysia, flagsPanel } from "../src/adapters/elysia2.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";

const app = new Elysia().use(
  flagsElysia({ prefix: "/flags", sourceStorage: createMemoryStorage(), title: "Eden v2" }),
);
const client = treaty<typeof app>(app);
const flags = client.flags!;
const as = <T>(v: unknown): T => v as unknown as T;

describe("elysia 2 adapter", () => {
  test("runs against Elysia 2 (rejects the 1.x handler-then-hook order)", () => {
    const legacy = () =>
      // the 1.x order type-checks on v2, but Elysia 2 throws on it at registration
      new Elysia().post("/x", () => "x", { body: t.Object({ k: t.String() }) });
    expect(legacy).toThrow(/1\.x order/);
  });

  test("flagsPanel mounts under a prefix", async () => {
    const mounted = new Elysia().mount(
      "/flags",
      flagsPanel({ sourceStorage: createMemoryStorage(), basePath: "/flags" }),
    );
    const res = await mounted.handle(new Request("http://x/flags/config"));
    expect((await res.json()).basePath).toBe("/flags");
  });

  test("reads bootstrap config via client.flags.config", async () => {
    const { data, error } = await flags.config.get();
    expect(error).toBeNull();
    expect(as<{ title: string }>(data).title).toBe("Eden v2");
  });

  test("creates, publishes and reads snapshots through the typed path", async () => {
    const env = flags.api
      .projects({ projectKey: "default" })
      .environments({ environmentKey: "production" });

    const created = await env.flags.post({
      key: "eden-v2-flag",
      type: "boolean",
      enabled: true,
      defaultVariant: "off",
      variants: { on: { value: true }, off: { value: false } },
      fallthrough: { variant: "off" },
    });
    expect(created.response.status).toBe(201);

    const pub = await env.publish.post({ message: "via eden v2" });
    expect(pub.response.status).toBe(201);
    const snaps = await env.snapshots.get();
    expect(as<{ active: string | null }>(snaps.data).active).toBe("v1");
  });

  test("validates declared bodies", async () => {
    const res = await app.handle(
      new Request("http://x/flags/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "missing key" }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("serves the bundled UI catch-all", async () => {
    const res = await app.handle(new Request("http://x/flags/"));
    expect(res.status).toBeLessThan(500);
  });
});
