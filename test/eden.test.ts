import { describe, expect, test } from "vitest";
import { Elysia } from "elysia";
import { treaty } from "@elysiajs/eden";
import { flagsElysia } from "../src/adapters/elysia.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";

// Mounting the typed plugin under /flags gives Eden's treaty a typed surface:
// client.flags.api.projects(...).environments(...).flags.get()
const app = new Elysia().use(
  flagsElysia({ prefix: "/flags", sourceStorage: createMemoryStorage(), title: "Eden Test" }),
);
const client = treaty<typeof app>(app);
// Eden types the prefix group as optional; bind it once for ergonomic access.
const flags = client.flags!;
// Handlers delegate to a web Response, so Eden infers `data: Response`; cast via unknown.
const as = <T>(v: unknown): T => v as unknown as T;

describe("eden typed client", () => {
  test("reads bootstrap config via client.flags.config", async () => {
    const { data, error } = await flags.config.get();
    expect(error).toBeNull();
    expect(as<{ basePath: string }>(data).basePath).toBe("/flags");
    expect(as<{ title: string }>(data).title).toBe("Eden Test");
  });

  test("creates and lists flags through the typed path", async () => {
    const env = flags.api
      .projects({ projectKey: "default" })
      .environments({ environmentKey: "production" });

    const created = await env.flags.post({
      key: "eden-flag",
      type: "boolean",
      enabled: true,
      defaultVariant: "off",
      variants: { on: { value: true }, off: { value: false } },
      fallthrough: { variant: "off" },
    });
    expect(created.response.status).toBe(201);

    const list = await env.flags.get();
    expect(as<{ key: string }[]>(list.data).some((f) => f.key === "eden-flag")).toBe(true);
  });

  test("publishes and reads snapshots through the typed path", async () => {
    const env = flags.api
      .projects({ projectKey: "default" })
      .environments({ environmentKey: "production" });
    const pub = await env.publish.post({ message: "via eden" });
    expect(pub.response.status).toBe(201);
    const snaps = await env.snapshots.get();
    expect(as<{ active: string | null }>(snaps.data).active).toBe("v1");
  });

  test("exposes the OpenAPI document", async () => {
    const res = await flags.api["openapi.json"].get();
    expect(as<{ openapi: string }>(res.data).openapi).toBe("3.1.0");
  });
});
