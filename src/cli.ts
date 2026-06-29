/**
 * `xtandard-flags` CLI. Operates on the same storage your app/admin uses
 * (configured via the `SOURCE_STORAGE_DRIVER` / `RUNTIME_STORAGE_DRIVER` env vars,
 * mirroring the standalone app), so it slots into GitOps and CI workflows.
 *
 * Commands: `init`, `list`, `validate`, `publish`, `rollback <version>`, `inspect`.
 *
 * @module
 */

import { createFlagsCore, type FlagsCore } from "./core.ts";
import { validateDraft } from "./validation.ts";
import type { FlagsStorage } from "./storage/contract.ts";

type Driver = "redis" | "unstorage" | "file" | "memory" | "postgres" | "mongodb";

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
  init                       Create the default project/environment and an empty draft.
  list                       List flags in the current draft.
  validate                   Validate the draft; exit 1 if invalid.
  publish [--message <m>]    Compile the draft into a new snapshot and activate it.
  rollback <version>         Re-point the active version to an existing snapshot.
  inspect [--version <v>]    Print the active (or given) snapshot's flags.

Options:
  --project <key>            Project key (default: $PROJECT or "default").
  --env <key>                Environment key (default: $ENVIRONMENT or "production").

Storage (env, same as the standalone app):
  SOURCE_STORAGE_DRIVER / RUNTIME_STORAGE_DRIVER   redis | postgres | mongodb | unstorage | file | memory  (default: file)
  REDIS_URL · DATABASE_URL/POSTGRES_URL · MONGO_URL/MONGO_DB
  SOURCE_FILE_DIR, RUNTIME_FILE_DIR, SOURCE_PREFIX, RUNTIME_PREFIX
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
