import { afterAll, beforeAll, describe, expect, test } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { flagsPanel } from "../src/adapters/express.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { themeFlag } from "./fixtures.ts";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.get("/", (_req, res) => res.send("app"));
  app.use("/flags", flagsPanel({ basePath: "/flags", sourceStorage: createMemoryStorage() }));
  // A mount where an upstream body parser consumes the stream first, so the
  // adapter must re-serialize req.body (the `req.readableEnded` branch).
  app.use(
    "/parsed",
    express.json(),
    flagsPanel({ basePath: "/parsed", sourceStorage: createMemoryStorage() }),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://localhost:${port}`;
});

afterAll(() => {
  server?.close();
});

describe("express adapter", () => {
  test("serves bootstrap config under the mount path", async () => {
    const res = await fetch(`${base}/flags/config`);
    expect(res.status).toBe(200);
    expect((await res.json()).basePath).toBe("/flags");
  });

  test("does not interfere with the host app", async () => {
    const res = await fetch(`${base}/`);
    expect(await res.text()).toBe("app");
  });

  test("handles a POST with a JSON body (raw stream)", async () => {
    const res = await fetch(`${base}/flags/api/projects/default/environments/production/flags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(themeFlag()),
    });
    expect(res.status).toBe(201);
    const list = await fetch(`${base}/flags/api/projects/default/environments/production/flags`);
    expect((await list.json()).length).toBe(1);
  });

  test("serves the SPA fallback", async () => {
    const res = await fetch(`${base}/flags/anything`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("re-serializes a body already parsed by express.json()", async () => {
    const res = await fetch(`${base}/parsed/api/projects/default/environments/production/flags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(themeFlag()),
    });
    expect(res.status).toBe(201);
    const list = await fetch(`${base}/parsed/api/projects/default/environments/production/flags`);
    expect((await list.json()).length).toBe(1);
  });

  test("attaches the admin core to the handler", () => {
    const handler = flagsPanel({ sourceStorage: createMemoryStorage() });
    expect(handler.core).toBeDefined();
    expect(typeof handler.core.listProjects).toBe("function");
  });
});
