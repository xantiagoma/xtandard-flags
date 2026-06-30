/**
 * Integration test for the CLI `serve` command. It boots the server in a
 * subprocess (so the never-resolving `run(["serve"])` doesn't hang the test),
 * then checks the healthcheck and that basic-auth is enforced on a protected
 * route. Spawned via Bun, so it runs under `bun test` (not vitest).
 *
 *   bun test test/cli-serve.bun.test.ts
 */
import { afterAll, expect, test } from "bun:test";

const PORT = 4317;
const BASE = `http://localhost:${PORT}`;

const proc = Bun.spawn(["bun", "-e", "import('./src/cli.ts').then((m) => m.run(['serve']))"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    AUTH_MODE: "basic",
    AUTH_USERNAME: "admin",
    AUTH_PASSWORD: "secret",
    SOURCE_STORAGE_DRIVER: "memory",
    RUNTIME_STORAGE_DRIVER: "memory",
  },
  stdout: "pipe",
  stderr: "pipe",
});

afterAll(() => {
  proc.kill();
});

async function waitForServer(timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/healthcheck`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(250);
  }
  throw new Error("serve did not become ready in time");
}

test("serve boots, answers healthcheck, and enforces basic auth", async () => {
  await waitForServer();

  const health = await fetch(`${BASE}/healthcheck`);
  expect(health.status).toBe(200);
  expect((await health.json()).status).toBe("ok");

  // Bootstrap config is public (mirrors the standalone/Docker behavior).
  expect((await fetch(`${BASE}/api/config`)).status).toBe(200);

  // A protected admin route requires the configured credentials.
  const protectedUrl = `${BASE}/api/projects/default/environments/production/flags`;
  expect((await fetch(protectedUrl)).status).toBe(401);
  expect(
    (await fetch(protectedUrl, { headers: { authorization: `Basic ${btoa("admin:wrong")}` } }))
      .status,
  ).toBe(401);
  expect(
    (await fetch(protectedUrl, { headers: { authorization: `Basic ${btoa("admin:secret")}` } }))
      .status,
  ).toBe(200);
});
