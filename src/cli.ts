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
  buildAuthFromEnv,
  describeStorage as kitDescribeStorage,
  env,
  isMainModule,
  isTruthy,
  parseArgs as kitParseArgs,
  pkgVersion as kitPkgVersion,
  serve,
  storageFromEnv,
  storageRegistryFrom,
  type StorageRegistry,
  type StorageRole,
} from "@xtandard/kit/cli";
import { FLAGS_ACTIONS, type FlagsAction } from "./authorization/contract.ts";
import {
  createFlagsCore,
  type FlagsCore,
  type RetentionOptions,
  type RetentionRule,
} from "./core.ts";
import type { FlagDuration } from "./schema.ts";
import { validateDraft } from "./validation.ts";
import type { FlagsStorage } from "./storage/contract.ts";

/** The two storage planes: `SOURCE` (drafts, history, audit) and `RUNTIME` (published snapshots). */
type Role = "SOURCE" | "RUNTIME";

/** The drivers the CLI accepts (an unknown `*_STORAGE_DRIVER` is an error). */
const DRIVERS = ["memory", "file", "redis", "postgres", "mongodb", "sqlite", "unstorage"] as const;

/**
 * A role's env settings (`SOURCE_STORAGE_DRIVER`, `SOURCE_PG_TABLE`…) and the
 * persisted defaults every earlier CLI release used (ADR 0005).
 */
const storageRole = (role: Role): StorageRole => {
  const r = role.toLowerCase();
  return {
    name: role,
    defaults: {
      prefix: `xtandard:flags:${r}`,
      pgTable: `xtandard_flags_${r}`,
      mongoDb: "xtandard_flags",
      mongoCollection: `flags_${r}`,
      sqlitePath: `./.flags/${r}.sqlite`,
      sqliteTable: "xtandard_flags",
      fileDir: `./.flags/${r}`,
    },
  };
};

/**
 * The CLI's drivers, over the flags storage wrappers (so their defaults and
 * error messages apply). Each loads its optional peer only when chosen; `sqlite`
 * needs the CLI to run under Bun (`bunx xtandard-flags …`), and `unstorage` is
 * an in-memory instance (for trying the adapter; wire your own driver in code).
 */
const STORAGE_DRIVERS = storageRegistryFrom({
  memory: () => import("./storage/memory.ts"),
  file: () => import("./storage/file.ts"),
  redis: () => import("./storage/redis.ts"),
  postgres: () => import("./storage/postgres.ts"),
  mongodb: () => import("./storage/mongodb.ts"),
  sqlite: () => import("./storage/sqlite.ts"),
  unstorage: () => import("./storage/unstorage.ts"),
}) as StorageRegistry<FlagsStorage>;

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

/** Build a role's storage from env. An unknown driver is an error (it used to fall back to `file`). */
async function buildStorage(role: Role): Promise<FlagsStorage> {
  return storageFromEnv({ role: storageRole(role), drivers: STORAGE_DRIVERS, allowed: DRIVERS });
}

/**
 * A human-readable, log-safe description of where a storage role persists data —
 * for the `serve` startup banner. File/SQLite paths are resolved to absolute so
 * "where did my flags go?" is obvious; connection-string drivers print only the
 * driver name (never the URL, which may carry credentials).
 */
async function describeStorage(role: Role): Promise<string> {
  return kitDescribeStorage(storageRole(role), { allowed: DRIVERS });
}

/**
 * The auth + authorization providers from env (mirrors the standalone app):
 * `AUTH_MODE=none` (default) or `basic`; anything else is an error.
 */
async function buildAuth() {
  const { DEFAULT_ROLE_POLICY } = await import("./authorization/roles.ts");
  return buildAuthFromEnv<FlagsAction>({
    realm: "xtandard-flags",
    roles: { policy: DEFAULT_ROLE_POLICY, actions: FLAGS_ACTIONS },
    name: "xtandard/flags",
  });
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
 * The CLI's argv parser: `--key value`, `--key=value`, `--flag`, `-h`, `-v`.
 * `--version` takes a value (`inspect --version v2`); bare, it prints the version.
 */
const parseArgs = (argv: string[]) => kitParseArgs(argv, { boolean: ["help"] });

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

/** This package's version, from the nearest package.json (dist or src). */
const pkgVersion = (): Promise<string> => kitPkgVersion(import.meta.url);

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
    SOURCE_SQLITE_TABLE, RUNTIME_SQLITE_TABLE   default xtandard_flags    (driver: sqlite)
    An unknown driver is an error. An empty variable counts as unset.

  Server  (\`serve\` / standalone):
    PORT            3000        Port to listen on (or --port).
    BASE_PATH       ""          URL prefix, e.g. "/flags".
    TITLE                       Navbar wordmark.
    LOGO_URL                    Logo image URL.
    READONLY        1|true      Block all mutating operations.
    STREAMING       1|true      Enable the OFREP SSE stream (GET /ofrep/v1/stream).
    UI_DIR                      Directory of the built admin UI (default: the package's dist/ui).
    AUTH_MODE       none|basic  Authentication mode (default none; any other value is rejected).
    AUTH_USERNAME   admin       Username for basic auth.
    AUTH_ROLE       admin       Role of the basic-auth user (admin | editor | viewer).
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
        const { createFetchHandler } = await import("./server/create-fetch-handler.ts");
        // `serve` reads PORT, BASE_PATH, TITLE, LOGO_URL and READONLY, warns on
        // AUTH_MODE=none, prints the banner and owns the process from then on.
        return await serve({
          name: "xtandard/flags",
          ...(typeof flags.port === "string" ? { port: Number(flags.port) } : {}),
          buildPanel: async ({ basePath, title, logoUrl, readonly }) => {
            const [sourceStorage, runtimeStorage, { auth, authorization }] = await Promise.all([
              buildStorage("SOURCE"),
              buildStorage("RUNTIME"),
              buildAuth(),
            ]);
            await registerSiftIfPresent();
            const panelTitle = title ?? "@xtandard/flags";
            const panel = createFetchHandler({
              basePath,
              sourceStorage,
              runtimeStorage,
              title: panelTitle,
              ...(logoUrl ? { logoUrl } : {}),
              // The built SPA; defaults to the package's own `dist/ui`.
              ...(env("UI_DIR") ? { uiDir: env("UI_DIR") } : {}),
              readonly,
              auth,
              authorization,
              streaming: isTruthy(env("STREAMING")),
              retention: retentionFromEnv(),
            });
            // The standalone healthcheck (Docker HEALTHCHECK): `{ status, title }`
            // at the root and under the base path, unauthenticated.
            const health = JSON.stringify({ status: "ok", title: panelTitle });
            const fetch: FetchHandler = (request) => {
              const { pathname } = new URL(request.url);
              if (pathname === "/healthcheck" || pathname === `${basePath}/healthcheck`) {
                return new Response(health, { headers: { "content-type": "application/json" } });
              }
              return panel.fetch(request);
            };
            return { fetch, close: panel.close };
          },
          banner: async () => [
            `storage source:  ${await describeStorage("SOURCE")}`,
            `storage runtime: ${await describeStorage("RUNTIME")}`,
          ],
        });
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

// Run only when executed directly (`bun src/cli.ts`), not when imported by the
// bin shim, the standalone app or a test.
if (isMainModule({ url: import.meta.url }))
  void run(process.argv.slice(2)).then((code) => process.exit(code));
