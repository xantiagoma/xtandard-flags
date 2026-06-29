import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MongoClient } from "mongodb";
import { createMongoStorage, type MongoFlagsStorage } from "../src/storage/mongodb.ts";
import { runStorageContractTests } from "./storage-contract.ts";

const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27117";

// Detect a reachable MongoDB up front (short timeout) so CI without a server
// simply skips the live suite instead of hanging on connection attempts.
let available = false;
{
  const probe = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 1500 });
  try {
    await probe.connect();
    await probe.db("admin").command({ ping: 1 });
    available = true;
  } catch {
    available = false;
  } finally {
    await probe.close().catch(() => {});
  }
}

// A unique database per run keeps concurrent/repeated runs isolated; it is
// dropped in afterAll.
const dbName = `flags_test_${Date.now()}`;

describe.skipIf(!available)("createMongoStorage (live)", () => {
  // Fresh collection per contract test, so the shared suite starts empty.
  let counter = 0;
  const makers: MongoFlagsStorage[] = [];

  runStorageContractTests("mongodb", () => {
    const storage = createMongoStorage({
      url: MONGO_URL,
      dbName,
      collectionName: `kv_${counter++}`,
    });
    makers.push(storage);
    return storage;
  });

  describe("mongodb specifics", () => {
    let storage: MongoFlagsStorage;

    beforeAll(() => {
      storage = createMongoStorage({ url: MONGO_URL, dbName, collectionName: "specifics" });
      makers.push(storage);
    });

    test("round-trips a nested object value directly (no JSON wrapping)", async () => {
      const value = { enabled: true, rollout: 42, tags: ["a", "b"], nested: { x: { y: 1 } } };
      await storage.setItem("flags/p/e/obj", value);
      expect(await storage.getItem("flags/p/e/obj")).toEqual(value);
    });

    test("returns null for a missing key", async () => {
      expect(await storage.getItem("flags/p/e/does-not-exist")).toBeNull();
    });

    test("getKeys isolates by prefix", async () => {
      await storage.setItem("flags/iso1/e/a", { v: 1 });
      await storage.setItem("flags/iso2/e/b", { v: 2 });
      expect(await storage.getKeys("flags/iso1/")).toEqual(["flags/iso1/e/a"]);
      expect(await storage.getKeys("flags/iso2/")).toEqual(["flags/iso2/e/b"]);
    });

    test("getKeys returns nested keys under a prefix", async () => {
      await storage.setItem("flags/nest/e/snapshots/v1", { v: 1 });
      await storage.setItem("flags/nest/e/snapshots/v2", { v: 2 });
      await storage.setItem("flags/nest/e/active", "v2");
      const keys = await storage.getKeys("flags/nest/e/");
      expect(keys.sort()).toEqual(
        ["flags/nest/e/active", "flags/nest/e/snapshots/v1", "flags/nest/e/snapshots/v2"].sort(),
      );
    });
  });

  afterAll(async () => {
    // Drop the throwaway database, then close every client this suite opened so
    // the vitest process can exit cleanly.
    const cleanup = new MongoClient(MONGO_URL);
    try {
      await cleanup.connect();
      await cleanup.db(dbName).dropDatabase();
    } finally {
      await cleanup.close();
    }
    for (const s of makers) await s.close();
  });
});

/**
 * Shape checks that need no live server: a created adapter exposes the full
 * {@link MongoFlagsStorage} surface (the contract methods plus `close`) and is
 * not watchable.
 */
describe("createMongoStorage shape", () => {
  test("exposes the FlagsStorage + close surface without connecting", () => {
    const storage = createMongoStorage({ url: "mongodb://localhost:27017" });
    expect(typeof storage.getItem).toBe("function");
    expect(typeof storage.setItem).toBe("function");
    expect(typeof storage.removeItem).toBe("function");
    expect(typeof storage.getKeys).toBe("function");
    expect(typeof storage.close).toBe("function");
    expect("watch" in storage).toBe(false);
  });

  test("close() before any connection is a safe no-op", async () => {
    const storage = createMongoStorage({ url: "mongodb://localhost:27017" });
    await expect(storage.close()).resolves.toBeUndefined();
  });

  test("throws a clear error when neither client nor url is supplied", async () => {
    const storage = createMongoStorage({});
    await expect(storage.getItem("flags/p/e/k")).rejects.toThrow(
      /requires either a "client" or a "url"/,
    );
  });

  test("a connection failure is not cached: a later call retries", async () => {
    // Point at an unroutable port with a short server-selection timeout so this
    // fails fast. The first call rejects; the second must attempt to connect
    // again (the `connecting` promise is cleared on failure).
    const storage = createMongoStorage({
      url: "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200&connectTimeoutMS=200",
    });
    await expect(storage.getItem("flags/p/e/k")).rejects.toBeTruthy();
    await expect(storage.getItem("flags/p/e/k")).rejects.toBeTruthy();
    await storage.close();
  });

  test("a pre-connected, borrowed client is not closed by close()", async () => {
    let closed = false;
    let _connectCalls = 0;
    const fakeCollection = {
      findOne: async () => null,
      updateOne: async () => ({}),
      deleteOne: async () => ({}),
      find: () => ({ project: () => ({ [Symbol.asyncIterator]: async function* () {} }) }),
    };
    const fakeClient = {
      async connect() {
        _connectCalls++;
      },
      db: () => ({ collection: () => fakeCollection }),
      async close() {
        closed = true;
      },
    };
    const storage = createMongoStorage({ client: fakeClient as never });
    expect(await storage.getItem("flags/p/e/k")).toBeNull();
    await storage.close();
    // close() is a no-op for borrowed clients.
    expect(closed).toBe(false);
  });

  test("an 'already connected' connect() error is swallowed", async () => {
    const fakeCollection = { findOne: async () => null };
    const fakeClient = {
      async connect() {
        throw new Error("MongoClient is already connected");
      },
      db: () => ({ collection: () => fakeCollection }),
      async close() {},
    };
    const storage = createMongoStorage({ client: fakeClient as never });
    expect(await storage.getItem("flags/p/e/k")).toBeNull();
  });

  test("a genuine connect() error propagates", async () => {
    const fakeClient = {
      async connect() {
        throw new Error("authentication failed");
      },
      db: () => ({ collection: () => ({}) }),
      async close() {},
    };
    const storage = createMongoStorage({ client: fakeClient as never });
    await expect(storage.getItem("flags/p/e/k")).rejects.toThrow(/authentication failed/);
  });
});
