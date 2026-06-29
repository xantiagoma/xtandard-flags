import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { run } from "../src/cli.ts";

const REDIS_URL = process.env.REDIS_URL;
const POSTGRES_URL = process.env.POSTGRES_URL;
const MONGO_URL = process.env.MONGO_URL;

let out: string[];
let err: string[];
const saved: Record<string, string | undefined> = {};

const DRIVER_ENV = [
  "SOURCE_STORAGE_DRIVER",
  "RUNTIME_STORAGE_DRIVER",
  "REDIS_URL",
  "POSTGRES_URL",
  "DATABASE_URL",
  "MONGO_URL",
  "MONGO_DB",
  "SOURCE_PG_TABLE",
  "RUNTIME_PG_TABLE",
  "SOURCE_MONGO_COLLECTION",
  "RUNTIME_MONGO_COLLECTION",
];

beforeEach(() => {
  out = [];
  err = [];
  for (const k of DRIVER_ENV) saved[k] = process.env[k];
  vi.spyOn(process.stdout, "write").mockImplementation((s) => (out.push(String(s)), true));
  vi.spyOn(process.stderr, "write").mockImplementation((s) => (err.push(String(s)), true));
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of DRIVER_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("cli storage drivers", () => {
  test("unstorage driver: init works (in-memory unstorage)", async () => {
    process.env.SOURCE_STORAGE_DRIVER = "unstorage";
    process.env.RUNTIME_STORAGE_DRIVER = "unstorage";
    expect(await run(["init"])).toBe(0);
    expect(out.join("")).toContain("Initialized");
  });

  test.skipIf(!REDIS_URL)("redis driver: init connects and initializes", async () => {
    process.env.SOURCE_STORAGE_DRIVER = "redis";
    process.env.RUNTIME_STORAGE_DRIVER = "redis";
    process.env.SOURCE_PREFIX = `cli-redis-src:${Date.now()}`;
    process.env.RUNTIME_PREFIX = `cli-redis-rt:${Date.now()}`;
    expect(await run(["init"])).toBe(0);
    expect(out.join("")).toContain("Initialized");
    delete process.env.SOURCE_PREFIX;
    delete process.env.RUNTIME_PREFIX;
  });

  test.skipIf(!POSTGRES_URL)("postgres driver: init connects and initializes", async () => {
    process.env.SOURCE_STORAGE_DRIVER = "postgres";
    process.env.RUNTIME_STORAGE_DRIVER = "postgres";
    process.env.SOURCE_PG_TABLE = `cli_flags_src_${Date.now()}`;
    process.env.RUNTIME_PG_TABLE = `cli_flags_rt_${Date.now()}`;
    expect(await run(["init"])).toBe(0);
    expect(out.join("")).toContain("Initialized");
  });

  test.skipIf(!MONGO_URL)("mongodb driver: init connects and initializes", async () => {
    process.env.SOURCE_STORAGE_DRIVER = "mongodb";
    process.env.RUNTIME_STORAGE_DRIVER = "mongodb";
    process.env.MONGO_DB = `cli_flags_${Date.now()}`;
    expect(await run(["init"])).toBe(0);
    expect(out.join("")).toContain("Initialized");
  });
});
