/**
 * Standalone `@xtandard/flags` server.
 *
 * Reads configuration from environment variables, builds source/runtime storage,
 * an auth provider, and the panel handler, then serves it (plus `/healthcheck`)
 * with `Bun.serve`. This is what the Docker image runs.
 */

// In-repo app: imports the library from source (Bun runs TS directly), so the
// Docker image needs no compiled lib — only the UI bundle (dist/ui). Published
// consumers import from "@xtandard/flags/*"; see examples/ for that usage.
import { fileURLToPath } from "node:url";
import { flagsPanel } from "../../../src/adapters/bun.ts";
import { basicAuth } from "../../../src/auth/basic.ts";
import { noAuth } from "../../../src/auth/none.ts";
import { rolesAuthorization } from "../../../src/authorization/roles.ts";
import { noAuthorization } from "../../../src/authorization/none.ts";
import { createMemoryStorage } from "../../../src/storage/memory.ts";
import { createFileStorage } from "../../../src/storage/file.ts";
import { createRedisStorage } from "../../../src/storage/redis.ts";
import { createUnstorageStorage } from "../../../src/storage/unstorage.ts";
import { createPostgresStorage } from "../../../src/storage/postgres.ts";
import { createMongoStorage } from "../../../src/storage/mongodb.ts";
import { createSqliteStorage } from "../../../src/storage/sqlite.ts";
import type { AuthProvider, FlagsStorage } from "../../../src/index.ts";

const env = (key: string, fallback = ""): string => process.env[key] ?? fallback;
const bool = (key: string, fallback = false): boolean => {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
};

type Driver = "redis" | "unstorage" | "file" | "memory" | "postgres" | "mongodb" | "sqlite";

async function buildStorage(role: "SOURCE" | "RUNTIME"): Promise<FlagsStorage> {
  const driver = (env(`${role}_STORAGE_DRIVER`, "memory") as Driver) || "memory";
  const role_ = role.toLowerCase();
  const prefix = env(`${role}_PREFIX`, `xtandard:flags:${role_}`);
  switch (driver) {
    case "redis":
      return createRedisStorage({ url: env("REDIS_URL", "redis://localhost:6379"), prefix });
    case "file":
      return createFileStorage({ dir: env(`${role}_FILE_DIR`, `./data/${role_}`) });
    case "sqlite":
      return createSqliteStorage({ path: env(`${role}_SQLITE_PATH`, `./data/${role_}.sqlite`) });
    case "postgres":
      // Same DATABASE_URL for both roles; a separate table keeps them isolated.
      return createPostgresStorage({
        connectionString:
          env("DATABASE_URL") || env("POSTGRES_URL", "postgres://localhost:5432/postgres"),
        table: env(`${role}_PG_TABLE`, `xtandard_flags_${role_}`),
      });
    case "mongodb":
      // Same MONGO_URL for both roles; a separate collection keeps them isolated.
      return createMongoStorage({
        url: env("MONGO_URL", "mongodb://localhost:27017"),
        dbName: env("MONGO_DB", "xtandard_flags"),
        collectionName: env(`${role}_MONGO_COLLECTION`, `flags_${role_}`),
      });
    case "unstorage": {
      const { createStorage } = await import("unstorage");
      return createUnstorageStorage({ storage: createStorage() });
    }
    case "memory":
    default:
      return createMemoryStorage();
  }
}

function buildAuth(): AuthProvider {
  const mode = env("AUTH_MODE", "none");
  if (mode === "basic") {
    const username = env("AUTH_USERNAME", "admin");
    const passwordHash = env("AUTH_PASSWORD_HASH");
    const password = env("AUTH_PASSWORD");
    if (!passwordHash && !password) {
      console.warn(
        "[xtandard/flags] AUTH_MODE=basic but neither AUTH_PASSWORD_HASH nor AUTH_PASSWORD is set.",
      );
    }
    return basicAuth({
      users: [
        {
          username,
          passwordHash: passwordHash || undefined,
          password: password || undefined,
          roles: ["admin"],
        },
      ],
    });
  }
  return noAuth();
}

async function main(): Promise<void> {
  const port = Number(env("PORT", "3000"));
  const basePath = env("BASE_PATH", "");
  const title = env("TITLE", "Xtandard Flags");
  const readonly = bool("READONLY", false);
  const authMode = env("AUTH_MODE", "none");

  const [sourceStorage, runtimeStorage] = await Promise.all([
    buildStorage("SOURCE"),
    buildStorage("RUNTIME"),
  ]);

  if (authMode === "none") {
    console.warn(
      "[xtandard/flags] Running with AUTH_MODE=none. Do NOT expose this publicly without authentication.",
    );
  }

  // The bundled UI lives at <repo>/dist/ui; resolve it relative to this file so
  // it works both locally and inside the Docker image.
  const uiDir = process.env.UI_DIR ?? fileURLToPath(new URL("../../../dist/ui", import.meta.url));

  const panel = flagsPanel({
    basePath,
    sourceStorage,
    runtimeStorage,
    title,
    readonly,
    uiDir,
    auth: buildAuth(),
    authorization: authMode === "basic" ? rolesAuthorization({}) : noAuthorization(),
  });

  const normalizedBase =
    basePath && basePath !== "/" ? (basePath.startsWith("/") ? basePath : `/${basePath}`) : "";

  Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/healthcheck" || url.pathname === `${normalizedBase}/healthcheck`) {
        return new Response(JSON.stringify({ status: "ok", title }), {
          headers: { "content-type": "application/json" },
        });
      }
      return panel.fetch(request);
    },
  });

  console.log(`[xtandard/flags] listening on http://localhost:${port}${normalizedBase || "/"}`);
}

main().catch((err) => {
  console.error("[xtandard/flags] failed to start:", err);
  process.exit(1);
});
