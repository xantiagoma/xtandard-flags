/**
 * `xtandard-flags` CLI. Operates on the same storage your app/admin uses
 * (configured via the `SOURCE_STORAGE_DRIVER` / `RUNTIME_STORAGE_DRIVER` env vars,
 * mirroring the standalone app), so it slots into GitOps and CI workflows.
 *
 * Commands: `serve` (run the panel + API server, no Docker), `init`, `list`,
 * `validate`, `publish`, `rollback <version>`, `inspect`, `eval`.
 *
 * @module
 */

import { createFlagsCore, type FlagsCore } from "./core.ts";
import { validateDraft } from "./validation.ts";
import type { FlagsStorage } from "./storage/contract.ts";
import type { AuthProvider } from "./auth/contract.ts";
import type { AuthorizationProvider } from "./authorization/contract.ts";

type Driver = "redis" | "unstorage" | "file" | "memory" | "postgres" | "mongodb" | "sqlite";

const env = (key: string, fallback = ""): string => process.env[key] ?? fallback;

async function buildStorage(role: "SOURCE" | "RUNTIME"): Promise<FlagsStorage> {
  const driver = (env(`${role}_STORAGE_DRIVER`, "file") as Driver) || "file";
  const prefix = env(`${role}_PREFIX`, `xtandard:flags:${role.toLowerCase()}`);
  switch (driver) {
    case "redis": {
      const { createRedisStorage } = await import("./storage/redis.ts");
      return createRedisStorage({ url: env("REDIS_URL", "redis://localhost:6379"), prefix });
    }
    case "unstorage": {
      const { createUnstorageStorage } = await import("./storage/unstorage.ts");
      const { createStorage } = (await import("unstorage")) as typeof import("unstorage");
      return createUnstorageStorage({ storage: createStorage() });
    }
    case "postgres": {
      const { createPostgresStorage } = await import("./storage/postgres.ts");
      return createPostgresStorage({
        connectionString:
          env("DATABASE_URL") || env("POSTGRES_URL", "postgres://localhost:5432/postgres"),
        table: env(`${role}_PG_TABLE`, `xtandard_flags_${role.toLowerCase()}`),
      });
    }
    case "mongodb": {
      const { createMongoStorage } = await import("./storage/mongodb.ts");
      return createMongoStorage({
        url: env("MONGO_URL", "mongodb://localhost:27017"),
        dbName: env("MONGO_DB", "xtandard_flags"),
        collectionName: env(`${role}_MONGO_COLLECTION`, `flags_${role.toLowerCase()}`),
      });
    }
    case "sqlite": {
      // Requires running the CLI under Bun (`bunx xtandard-flags …`).
      const { createSqliteStorage } = await import("./storage/sqlite.ts");
      return createSqliteStorage({
        path: env(`${role}_SQLITE_PATH`, `./.flags/${role.toLowerCase()}.sqlite`),
      });
    }
    case "memory": {
      const { createMemoryStorage } = await import("./storage/memory.ts");
      return createMemoryStorage();
    }
    case "file":
    default: {
      const { createFileStorage } = await import("./storage/file.ts");
      return createFileStorage({ dir: env(`${role}_FILE_DIR`, `./.flags/${role.toLowerCase()}`) });
    }
  }
}

/** Build the auth + authorization providers from env (mirrors the standalone app). */
async function buildAuth(): Promise<{ auth: AuthProvider; authorization: AuthorizationProvider }> {
  const mode = env("AUTH_MODE", "none");
  if (mode === "basic") {
    const [{ basicAuth }, { rolesAuthorization }] = await Promise.all([
      import("./auth/basic.ts"),
      import("./authorization/roles.ts"),
    ]);
    const passwordHash = env("AUTH_PASSWORD_HASH");
    const password = env("AUTH_PASSWORD");
    if (!passwordHash && !password) {
      process.stderr.write(
        "[xtandard/flags] AUTH_MODE=basic but neither AUTH_PASSWORD_HASH nor AUTH_PASSWORD is set.\n",
      );
    }
    return {
      auth: basicAuth({
        users: [
          {
            username: env("AUTH_USERNAME", "admin"),
            passwordHash: passwordHash || undefined,
            password: password || undefined,
            roles: ["admin"],
          },
        ],
      }),
      authorization: rolesAuthorization({}),
    };
  }
  const [{ noAuth }, { noAuthorization }] = await Promise.all([
    import("./auth/none.ts"),
    import("./authorization/none.ts"),
  ]);
  return { auth: noAuth(), authorization: noAuthorization() };
}

/** Register the optional `sift` query matcher (for `matches`/`notMatches`) if installed. */
async function registerSiftIfPresent(): Promise<void> {
  try {
    const [{ siftMatcher }, { registerMatcher }] = await Promise.all([
      import("./sift-matcher.ts"),
      import("./matchers.ts"),
    ]);
    registerMatcher("sift", siftMatcher);
    registerMatcher("default", siftMatcher);
  } catch {
    // `sift` is optional — `matches` with the sift/default matcher fails closed;
    // the built-in `regex` matcher is always available.
  }
}

type FetchHandler = (request: Request) => Response | Promise<Response>;

/**
 * Serve a web-standard fetch handler under whatever runtime the CLI runs on:
 * `Bun.serve` under `bunx`, a `node:http` bridge under `npx`/Node. Resolves only
 * once the server is listening; the process then stays alive on the open socket.
 */
async function startServer(port: number, fetch: FetchHandler): Promise<void> {
  const bun = (globalThis as { Bun?: { serve: (options: unknown) => unknown } }).Bun;
  if (bun) {
    bun.serve({ port, fetch });
    return;
  }
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const method = req.method ?? "GET";
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (v === undefined) continue;
          headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        }
        const host = req.headers.host ?? `localhost:${port}`;
        const url = `http://${host}${req.url ?? "/"}`;
        const hasBody = method !== "GET" && method !== "HEAD" && chunks.length > 0;
        const request = new Request(url, {
          method,
          headers,
          body: hasBody ? Buffer.concat(chunks) : undefined,
        });
        const response = await fetch(request);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (err) {
        res.statusCode = 500;
        res.end(`Internal error: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
}

/** Minimal flag/value argv parser: `--key value` and `--flag`. */
function parseArgs(argv: string[]): { _: string[]; flags: Record<string, string | boolean> } {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else _.push(a);
  }
  return { _, flags };
}

async function makeCore(flags: Record<string, string | boolean>): Promise<FlagsCore> {
  const [sourceStorage, runtimeStorage] = await Promise.all([
    buildStorage("SOURCE"),
    buildStorage("RUNTIME"),
  ]);
  return createFlagsCore({
    sourceStorage,
    runtimeStorage,
    defaultProjectKey: (flags.project as string) || env("PROJECT", "default"),
    defaultEnvironmentKey: (flags.env as string) || env("ENVIRONMENT", "production"),
  });
}

const HELP = `xtandard-flags — feature flag control plane CLI

Usage: xtandard-flags <command> [options]

Commands:
  serve [--port <n>]         Run the admin panel + API server (like the Docker image,
                             without Docker). Honors the env vars below. Works under
                             both \`npx\` (Node) and \`bunx\` (Bun).
  init                       Create the default project/environment and an empty draft.
  list                       List flags in the current draft.
  validate                   Validate the draft; exit 1 if invalid.
  publish [--message <m>]    Compile the draft into a new snapshot and activate it.
  rollback <version>         Re-point the active version to an existing snapshot.
  inspect [--version <v>]    Print the active (or given) snapshot's flags.
  eval [--key <k>] [--context '<json>'] [--source draft|active]
                             Test how flags resolve for an evaluation context.

Options:
  --project <key>            Project key (default: $PROJECT or "default").
  --env <key>                Environment key (default: $ENVIRONMENT or "production").
  --port <n>                 Port for \`serve\` (default: $PORT or 3000).

Storage (env, same as the standalone app):
  SOURCE_STORAGE_DRIVER / RUNTIME_STORAGE_DRIVER   redis | postgres | mongodb | unstorage | file | memory  (default: file)
  REDIS_URL · DATABASE_URL/POSTGRES_URL · MONGO_URL/MONGO_DB
  SOURCE_FILE_DIR, RUNTIME_FILE_DIR, SOURCE_PREFIX, RUNTIME_PREFIX

Server (env, for \`serve\`):
  PORT (3000) · BASE_PATH · TITLE · LOGO_URL · READONLY
  AUTH_MODE (none | basic) · AUTH_USERNAME · AUTH_PASSWORD_HASH · AUTH_PASSWORD

Example:
  PORT=4000 AUTH_MODE=basic AUTH_USERNAME=admin AUTH_PASSWORD=secret \\
  SOURCE_STORAGE_DRIVER=redis RUNTIME_STORAGE_DRIVER=redis REDIS_URL=redis://localhost:6379 \\
  npx @xtandard/flags serve
`;

/** Entry point. Returns the process exit code. */
export async function run(argv: string[]): Promise<number> {
  const { _, flags } = parseArgs(argv);
  const command = _[0];

  if (!command || flags.help || command === "help") {
    process.stdout.write(HELP);
    // Explicit help request → success; bare invocation with no command → usage error.
    return flags.help || command === "help" ? 0 : 1;
  }

  try {
    switch (command) {
      case "init": {
        const core = await makeCore(flags);
        await core.getDraft();
        const p = core.options.defaultProjectKey;
        const e = core.options.defaultEnvironmentKey;
        process.stdout.write(
          `Initialized project "${p}" / environment "${e}".\nAdd flags, then run: xtandard-flags publish\n`,
        );
        return 0;
      }
      case "list": {
        const core = await makeCore(flags);
        const list = await core.listFlags();
        if (list.length === 0) process.stdout.write("No flags in draft.\n");
        for (const f of list) {
          process.stdout.write(
            `${f.enabled ? "●" : "○"} ${f.key}  (${f.type})  default=${f.defaultVariant}  rules=${f.rules?.length ?? 0}\n`,
          );
        }
        return 0;
      }
      case "validate": {
        const core = await makeCore(flags);
        const draft = await core.getDraft();
        const result = validateDraft(draft);
        if (result.valid) {
          process.stdout.write(`Draft is valid (${Object.keys(draft.flags).length} flags).\n`);
          return 0;
        }
        process.stderr.write("Draft is INVALID:\n");
        for (const err of result.errors) process.stderr.write(`  - ${err.path}: ${err.message}\n`);
        return 1;
      }
      case "publish": {
        const core = await makeCore(flags);
        const snapshot = await core.publish({
          message: typeof flags.message === "string" ? flags.message : undefined,
        });
        process.stdout.write(
          `Published ${snapshot.version} (${Object.keys(snapshot.flags).length} flags).\n`,
        );
        return 0;
      }
      case "rollback": {
        const version = _[1];
        if (!version) {
          process.stderr.write("Usage: xtandard-flags rollback <version>\n");
          return 1;
        }
        const core = await makeCore(flags);
        const snapshot = await core.rollback({ version });
        process.stdout.write(`Rolled back to ${snapshot.version}.\n`);
        return 0;
      }
      case "eval": {
        const core = await makeCore(flags);
        let context: Record<string, unknown> = {};
        if (typeof flags.context === "string") {
          try {
            context = JSON.parse(flags.context) as Record<string, unknown>;
          } catch {
            process.stderr.write("Invalid --context JSON.\n");
            return 1;
          }
        }
        const source = flags.source === "active" ? "active" : "draft";
        const results = await core.evaluate({
          context,
          flagKey: typeof flags.key === "string" ? flags.key : undefined,
          source,
        });
        for (const r of results) {
          process.stdout.write(
            `${r.key} = ${JSON.stringify(r.value)}  [${r.reason}${r.variant ? ` · ${r.variant}` : ""}]\n`,
          );
        }
        return 0;
      }
      case "serve": {
        const port = Number((flags.port as string) || env("PORT", "3000"));
        const basePath = env("BASE_PATH", "");
        const title = env("TITLE", "@xtandard/flags");
        const logoUrl = env("LOGO_URL") || undefined;
        const readonly = env("READONLY") === "1" || env("READONLY").toLowerCase() === "true";
        const authMode = env("AUTH_MODE", "none");

        const { createFetchHandler } = await import("./server/create-fetch-handler.ts");
        const [sourceStorage, runtimeStorage] = await Promise.all([
          buildStorage("SOURCE"),
          buildStorage("RUNTIME"),
        ]);
        const { auth, authorization } = await buildAuth();
        await registerSiftIfPresent();

        if (authMode === "none") {
          process.stderr.write(
            "[xtandard/flags] AUTH_MODE=none — do NOT expose this publicly without authentication.\n",
          );
        }

        const panel = createFetchHandler({
          basePath,
          sourceStorage,
          runtimeStorage,
          title,
          logoUrl,
          readonly,
          auth,
          authorization,
        });

        const normalizedBase =
          basePath && basePath !== "/"
            ? basePath.startsWith("/")
              ? basePath
              : `/${basePath}`
            : "";

        const handler: FetchHandler = (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/healthcheck" || url.pathname === `${normalizedBase}/healthcheck`) {
            return new Response(JSON.stringify({ status: "ok", title }), {
              headers: { "content-type": "application/json" },
            });
          }
          return panel.fetch(request);
        };

        await startServer(port, handler);
        process.stdout.write(
          `[xtandard/flags] listening on http://localhost:${port}${normalizedBase || "/"}\n`,
        );
        // The server owns the process now; never resolve so the bin doesn't exit.
        return await new Promise<number>(() => {});
      }
      case "inspect": {
        const core = await makeCore(flags);
        const version = typeof flags.version === "string" ? flags.version : undefined;
        const snapshot = version ? await core.getSnapshot(version) : await core.getActiveSnapshot();
        if (!snapshot) {
          process.stderr.write(
            version ? `Snapshot "${version}" not found.\n` : "No active snapshot.\n",
          );
          return 1;
        }
        process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
        return 0;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
        return 1;
    }
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
