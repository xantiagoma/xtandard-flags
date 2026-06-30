/**
 * One-command runner for the polyglot OFREP client examples.
 *
 *   bun run examples:ofrep-clients
 *
 * Boots a throwaway @xtandard/flags server (in-memory, streaming) on a free port,
 * seeds two flags, then runs each language client (Python via uv, Go, plain TS)
 * whose toolchain is installed — pointing FLAGS_URL at the server. Skips any
 * language whose toolchain is missing. Tears the server down at the end.
 *
 * @module
 */

import { getPort } from "get-port-please";

const ENV = "production";
const PROJECT = "default";

async function sh(cmd: string[], cwd: string, env: Record<string, string>): Promise<number> {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exited;
}

async function waitForHealth(base: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(`${base}/healthcheck`)).ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(200);
  }
  throw new Error(`server did not become ready at ${base}`);
}

/** Seed the two flags the clients read (idempotent: replace draft + publish). */
async function seed(base: string): Promise<void> {
  const api = `${base}/api/projects/${PROJECT}/environments/${ENV}`;
  const flags = {
    "new-checkout": {
      key: "new-checkout",
      type: "boolean",
      enabled: true,
      defaultVariant: "off",
      variants: { on: { value: true }, off: { value: false } },
      rules: [
        {
          id: "beta",
          conditions: [{ attribute: "plan", operator: "equals", value: "beta" }],
          serve: { variant: "on" },
        },
      ],
      fallthrough: { variant: "off" },
    },
    "banner-color": {
      key: "banner-color",
      type: "string",
      enabled: true,
      defaultVariant: "blue",
      variants: { blue: { value: "#2563eb" }, green: { value: "#16a34a" } },
      fallthrough: { variant: "blue" },
    },
  };
  const json = { "content-type": "application/json" };
  await fetch(`${api}/draft`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({ projectKey: PROJECT, environmentKey: ENV, flags }),
  });
  await fetch(`${api}/publish`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ message: "seed" }),
  });
}

const clients = [
  {
    name: "Python (uv)",
    tool: "uv",
    dir: "examples/ofrep-clients/python",
    run: ["uv", "run", "--quiet", "main.py"],
    install: null as string[] | null,
  },
  {
    name: "Go",
    tool: "go",
    dir: "examples/ofrep-clients/go",
    run: ["go", "run", "."],
    install: null as string[] | null,
  },
  {
    name: "TypeScript (plain OpenFeature)",
    tool: "bun",
    dir: "examples/ofrep-clients/typescript",
    run: ["bun", "run", "main.ts"],
    install: ["bun", "install"] as string[] | null,
  },
];

const port = await getPort({ port: 8080, portRange: [8080, 8280] });
const base = `http://localhost:${port}`;

const server = Bun.spawn(["bun", "apps/standalone/src/index.ts"], {
  env: {
    ...process.env,
    PORT: String(port),
    STREAMING: "1",
    AUTH_MODE: "none",
    SOURCE_STORAGE_DRIVER: "memory",
    RUNTIME_STORAGE_DRIVER: "memory",
  },
  stdout: "ignore",
  stderr: "ignore",
});
const shutdown = () => server.kill();
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

try {
  await waitForHealth(base);
  await seed(base);
  console.log(`▶  panel + OFREP on ${base} (seeded new-checkout, banner-color)\n`);

  for (const c of clients) {
    console.log(`── ${c.name} ${"─".repeat(Math.max(0, 40 - c.name.length))}`);
    if (!Bun.which(c.tool)) {
      console.log(`   skipped — '${c.tool}' not installed\n`);
      continue;
    }
    if (c.install) await sh(c.install, c.dir, {});
    await sh(c.run, c.dir, { FLAGS_URL: base });
    console.log("");
  }
} finally {
  shutdown();
}
