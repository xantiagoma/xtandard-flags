import { describe, expect, test, vi } from "vitest";
import { isWatchable } from "../src/storage/contract.ts";
import { pgListenNotify, withWatch, type PgNotificationClient } from "../src/storage/watch.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";

describe("withWatch", () => {
  test("makes any storage watchable and still delegates reads/writes", async () => {
    const base = createMemoryStorage();
    const storage = withWatch(base, () => () => {});
    expect(isWatchable(storage)).toBe(true);

    await storage.setItem("k", { n: 1 });
    expect(await storage.getItem("k")).toEqual({ n: 1 });
    await storage.removeItem("k");
    expect(await storage.getItem("k")).toBeNull();
  });

  test("delivers changes whose key matches the prefix, filters the rest", async () => {
    let notify: (key?: string) => void = () => {};
    const storage = withWatch(createMemoryStorage(), (n) => {
      notify = n;
      return () => {};
    });
    const seen: string[] = [];
    await storage.watch("flags/p1/", (e) => seen.push(e.key));

    notify("flags/p1/e/a"); // match
    notify("flags/p2/e/b"); // filtered
    notify(); // no key → treated as a change to the prefix itself
    expect(seen).toEqual(["flags/p1/e/a", "flags/p1/"]);
  });

  test("returns the source's unsubscribe", async () => {
    const unsubscribe = vi.fn();
    const storage = withWatch(createMemoryStorage(), () => unsubscribe);
    const off = await storage.watch("flags/", () => {});
    await off();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("subscribe may be async", async () => {
    const storage = withWatch(createMemoryStorage(), async () => async () => {});
    const off = await storage.watch("flags/", () => {});
    await expect(off()).resolves.toBeUndefined();
  });
});

describe("pgListenNotify", () => {
  function fakeClient() {
    const queries: string[] = [];
    let handler: ((msg: { channel: string; payload?: string }) => void) | undefined;
    const client: PgNotificationClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
      }),
      on: (_e, listener) => {
        handler = listener;
      },
      removeListener: () => {
        handler = undefined;
      },
    };
    return {
      client,
      queries,
      emit: (channel: string, payload?: string) => handler?.({ channel, payload }),
    };
  }

  test("LISTENs, forwards matching-channel payloads, UNLISTENs on unsubscribe", async () => {
    const { client, queries, emit } = fakeClient();
    const storage = withWatch(createMemoryStorage(), pgListenNotify(client, "flags_ch"));

    const seen: string[] = [];
    const off = await storage.watch("flags/", (e) => seen.push(e.key));
    expect(queries.some((q) => q.includes(`LISTEN "flags_ch"`))).toBe(true);

    emit("flags_ch", "flags/a"); // forwarded
    emit("other_ch", "flags/b"); // wrong channel, ignored
    expect(seen).toEqual(["flags/a"]);

    await off();
    expect(queries.some((q) => q.includes(`UNLISTEN "flags_ch"`))).toBe(true);
  });
});
