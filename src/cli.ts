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

import {
  createFlagsCore,
  type FlagsCore,
  type RetentionOptions,
  type RetentionRule,
} from "./core.ts";
import type { FlagDuration } from "./schema.ts";
import { validateDraft } from "./validation.ts";
import type { FlagsStorage } from "./storage/contract.ts";
import type { AuthProvider } from "./auth/contract.ts";
import type { AuthorizationProvider } from "./authorization/contract.ts";

type Driver = "redis" | "unstorage" | "file" | "memory" | "postgres" | "mongodb" | "sqlite";

const env = (key: string, fallback = ""): string => process.env[key] ?? fallback;

/** Parse a duration env like `"34h"`, `"30d"`, `"90m"`, `"10s"` into a {@link FlagDuration}. */
function parseDurationEnv(name: string): FlagDuration | undefined {
  const raw = env(name);
  if (!raw) return undefined;
  const m = /^(\d+)\s*(s|m|h|d)$/.exec(raw.trim());
  if (!m) {
    process.stderr.write(
      `[xtandard/flags] Ignoring ${name}="${raw}" — expected <number><unit> with unit s|m|h|d (e.g. 34h, 30d).\n`,
    );
    return undefined;
  }
  const unit = ({ s: "seconds", m: "minutes", h: "hours", d: "days" } as const)[
    m[2] as "s" | "m" | "h" | "d"
  ];
  return { value: Number(m[1]), unit };
}

/**
 * Retention from env: `SNAPSHOT_KEEP_LAST` / `SNAPSHOT_MAX_AGE` and
 * `AUDIT_KEEP_LAST` / `AUDIT_MAX_AGE`. Returns undefined when none are set.
 */
function retentionFromEnv(): RetentionOptions | undefined {
  const rule = (keepVar: string, ageVar: string): RetentionRule | undefined => {
    const keepRaw = env(keepVar);
    const keepLast = keepRaw && /^\d+$/.test(keepRaw) ? Number(keepRaw) : undefined;
    if (keepRaw && keepLast === undefined) {
      process.stderr.write(
        `[xtandard/flags] Ignoring ${keepVar}="${keepRaw}" — expected a number.\n`,
      );
    }
    const maxAge = parseDurationEnv(ageVar);
    if (keepLast === undefined && !maxAge) return undefined;
    return { keepLast, maxAge };
  };
  const snapshots = rule("SNAPSHOT_KEEP_LAST", "SNAPSHOT_MAX_AGE");
  const audit = rule("AUDIT_KEEP_LAST", "AUDIT_MAX_AGE");
  if (!snapshots && !audit) return undefined;
  return { snapshots, audit };
}

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

/**
 * A human-readable, log-safe description of where a storage role persists data —
 * for the `serve` startup banner. File/SQLite paths are resolved to absolute so
 * "where did my flags go?" is obvious; connection-string drivers print only the
 * driver name (never the URL, which may carry credentials).
 */
async function describeStorage(role: "SOURCE" | "RUNTIME"): Promise<string> {
  const { resolve } = await import("node:path");
  const driver = (env(`${role}_STORAGE_DRIVER`, "file") as Driver) || "file";
  const r = role.toLowerCase();
  switch (driver) {
    case "file":
      return `file → ${resolve(env(`${role}_FILE_DIR`, `./.flags/${r}`))}`;
    case "sqlite":
      return `sqlite → ${resolve(env(`${role}_SQLITE_PATH`, `./.flags/${r}.sqlite`))}`;
    case "memory":
      return "memory (ephemeral — not persisted)";
    case "redis":
    case "postgres":
    case "mongodb":
    case "unstorage":
      return driver;
    default:
      return driver;
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
        // Stream SSE (text/event-stream) instead of buffering — long-lived body.
        if (
          response.body &&
          (response.headers.get("content-type") ?? "").includes("text/event-stream")
        ) {
          const reader = response.body.getReader();
          let aborted = false;
          res.on("close", () => {
            aborted = true;
            void reader.cancel().catch(() => {});
          });
          for (;;) {
            const { done, value } = await reader.read();
            if (done || aborted) break;
            res.write(Buffer.from(value));
          }
          res.end();
          return;
        }
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
    retention: retentionFromEnv(),
  });
}

/** Read this package's version from the nearest package.json (dist or src). */
async function pkgVersion(): Promise<string> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const pkg = JSON.parse(
      await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function helpText(version: string): string {
  return `xtandard-flags v${version} — self-hosted, OpenFeature-compatible feature-flag control plane

Usage:
  xtandard-flags <command> [options]     # the binary, after: npm i -g @xtandard/flags
  npx @xtandard/flags <command>          # without installing (or: bunx @xtandard/flags …)

Commands:
  serve [--port <n>]            Run the panel + JSON API + OFREP server (no Docker).
  init                          Create the default project/environment + empty draft.
  list                          List flags in the current draft.
  validate                      Validate the draft (exit 1 if invalid).
  publish [--message <m>]       Compile the draft → snapshot → activate it.
  rollback <version>            Re-point the active version to an existing snapshot.
  delete-snapshot <version>     Delete a snapshot (never the active or latest version).
  inspect [--version <v>]       Print the active (or given) snapshot as JSON.
  eval [--key <k>] [--context '<json>'] [--source draft|active]
                                Test how flags resolve for an evaluation context.

Global options:
  -h, --help                    Show this help.
  -v, --version                 Print the version.
  --project <key>               Project key      (default: $PROJECT or "default").
  --env <key>                   Environment key  (default: $ENVIRONMENT or "production").

\`serve\` options:
  --port <n>                    Port to listen on (default: $PORT or 3000).

Environment variables
  Storage  (one driver per plane; prefix SOURCE_ / RUNTIME_):
    SOURCE_STORAGE_DRIVER, RUNTIME_STORAGE_DRIVER
                                memory | file | redis | postgres | mongodb | sqlite | unstorage
                                (CLI default: file · Docker default: memory)
    REDIS_URL                   redis://localhost:6379                    (driver: redis)
    SOURCE_PREFIX, RUNTIME_PREFIX   key namespace                         (driver: redis)
    DATABASE_URL | POSTGRES_URL  postgres://…                             (driver: postgres)
    SOURCE_PG_TABLE, RUNTIME_PG_TABLE                                     (driver: postgres)
    MONGO_URL, MONGO_DB, SOURCE_MONGO_COLLECTION, RUNTIME_MONGO_COLLECTION (driver: mongodb)
    SOURCE_FILE_DIR, RUNTIME_FILE_DIR   default ./.flags/{source,runtime} (driver: file)
    SOURCE_SQLITE_PATH, RUNTIME_SQLITE_PATH                               (driver: sqlite, Bun only)

  Server  (\`serve\` / standalone):
    PORT            3000        Port to listen on (or --port).
    BASE_PATH       ""          URL prefix, e.g. "/flags".
    TITLE                       Navbar wordmark.
    LOGO_URL                    Logo image URL.
    READONLY        1|true      Block all mutating operations.
    STREAMING       1|true      Enable the OFREP SSE stream (GET /ofrep/v1/stream).
    AUTH_MODE       none|basic  Authentication mode (default none).
    AUTH_USERNAME   admin       Username for basic auth.
    AUTH_PASSWORD_HASH          scrypt hash (preferred; see docs/AUTH.md).
    AUTH_PASSWORD               Plaintext password (dev only).

  Retention  (applied after each publish; kept if EITHER rule keeps it;
              the active + latest snapshots are always kept):
    SNAPSHOT_KEEP_LAST  100     Keep at most the N most recent snapshots.
    SNAPSHOT_MAX_AGE    30d     Keep snapshots newer than this (s|m|h|d, e.g. 34h).
    AUDIT_KEEP_LAST     500     Keep at most the N most recent audit entries.
    AUDIT_MAX_AGE       90d     Keep audit entries newer than this.

  CLI defaults:
    PROJECT (default) · ENVIRONMENT (production)

Examples:
  # Quick local panel (file storage, no auth) with live SSE updates:
  STREAMING=1 npx @xtandard/flags serve --port 3004

  # Production-ish: Redis storage + basic auth:
  PORT=4000 AUTH_MODE=basic AUTH_USERNAME=admin AUTH_PASSWORD=secret \\
    SOURCE_STORAGE_DRIVER=redis RUNTIME_STORAGE_DRIVER=redis REDIS_URL=redis://localhost:6379 \\
    npx @xtandard/flags serve

  # Split planes: Postgres source + Redis runtime:
  SOURCE_STORAGE_DRIVER=postgres DATABASE_URL=postgres://localhost:5432/flags \\
    RUNTIME_STORAGE_DRIVER=redis REDIS_URL=redis://localhost:6379 \\
    npx @xtandard/flags serve

  # GitOps / CI against a draft:
  xtandard-flags validate && xtandard-flags publish --message "ship beta"
  xtandard-flags rollback v3
  xtandard-flags eval --key new-checkout --context '{"targetingKey":"u1","plan":"beta"}'

Apps in other languages evaluate over OFREP — point any OpenFeature OFREP provider
at this server. Docs: https://github.com/xantiagoma/xtandard-flags
`;
}

/** Entry point. Returns the process exit code. */
export async function run(argv: string[]): Promise<number> {
  const { _, flags } = parseArgs(argv);
  const command = _[0];

  // `--version` (bare) / `-v` / `version` → print version. Note `inspect --version v2`
  // passes a value, so only the boolean form is treated as "print version".
  if (flags.version === true || argv.includes("-v") || command === "version") {
    process.stdout.write(`${await pkgVersion()}\n`);
    return 0;
  }

  const wantsHelp = Boolean(flags.help) || argv.includes("-h") || command === "help";
  if (!command || wantsHelp) {
    process.stdout.write(helpText(await pkgVersion()));
    // Explicit help request → success; bare invocation with no command → usage error.
    return wantsHelp ? 0 : 1;
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
      case "delete-snapshot": {
        const version = _[1];
        if (!version) {
          process.stderr.write("Usage: xtandard-flags delete-snapshot <version>\n");
          return 1;
        }
        const core = await makeCore(flags);
        await core.deleteSnapshot({ version });
        process.stdout.write(`Deleted snapshot ${version}.\n`);
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

        const streaming = env("STREAMING") === "1" || env("STREAMING").toLowerCase() === "true";
        const panel = createFetchHandler({
          basePath,
          sourceStorage,
          runtimeStorage,
          title,
          logoUrl,
          readonly,
          auth,
          authorization,
          streaming,
          retention: retentionFromEnv(),
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

        const [sourceDesc, runtimeDesc] = await Promise.all([
          describeStorage("SOURCE"),
          describeStorage("RUNTIME"),
        ]);
        process.stdout.write(`[xtandard/flags] storage source:  ${sourceDesc}\n`);
        process.stdout.write(`[xtandard/flags] storage runtime: ${runtimeDesc}\n`);

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
        process.stderr.write(`Unknown command: ${command}\n\n${helpText(await pkgVersion())}`);
        return 1;
    }
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
