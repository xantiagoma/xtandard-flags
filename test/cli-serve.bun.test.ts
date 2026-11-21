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
const OPEN_PORT = 4318;

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

// Empty AUTH_MODE means the default `none` (not an unknown mode).
const openProc = Bun.spawn(["bun", "-e", "import('./src/cli.ts').then((m) => m.run(['serve']))"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(OPEN_PORT),
    AUTH_MODE: "",
    SOURCE_STORAGE_DRIVER: "memory",
    RUNTIME_STORAGE_DRIVER: "memory",
  },
  stdout: "pipe",
  stderr: "pipe",
});

afterAll(() => {
  proc.kill();
  openProc.kill();
});

async function waitForServer(timeoutMs = 20_000, base = BASE): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/healthcheck`);
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

/** Run `script` with an unknown AUTH_MODE; it must exit non-zero instead of serving. */
async function expectUnknownAuthModeRejected(script: string): Promise<void> {
  const proc = Bun.spawn(["bun", "-e", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(OPEN_PORT + 1),
      AUTH_MODE: "basci",
      SOURCE_STORAGE_DRIVER: "memory",
      RUNTIME_STORAGE_DRIVER: "memory",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = setTimeout(() => proc.kill(), 20_000);
  const code = await proc.exited;
  clearTimeout(timeout);
  expect(code).not.toBe(0);
  expect(await new Response(proc.stderr).text()).toContain(
    'Unknown AUTH_MODE "basci" (expected none or basic)',
  );
  expect(await new Response(proc.stdout).text()).not.toContain("listening");
}

test("serve exits non-zero on an unknown AUTH_MODE instead of serving an open panel", async () => {
  await expectUnknownAuthModeRejected(
    "import('./src/cli.ts').then((m) => m.run(['serve'])).then((code) => process.exit(code))",
  );
});

test("standalone (Docker entrypoint) exits non-zero on an unknown AUTH_MODE", async () => {
  await expectUnknownAuthModeRejected("await import('./apps/standalone/src/index.ts')");
});

test("serve with an empty AUTH_MODE defaults to none", async () => {
  await waitForServer(20_000, `http://localhost:${OPEN_PORT}`);
  const url = `http://localhost:${OPEN_PORT}/api/projects/default/environments/production/flags`;
  expect((await fetch(url)).status).toBe(200);
});
