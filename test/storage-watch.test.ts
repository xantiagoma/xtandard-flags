import { describe, expect, test, vi } from "vitest";
import { pgListenNotify, withWatch, type PgNotificationClient } from "../src/storage/watch.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";

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

  test('the channel defaults to the documented "xtandard_flags"', async () => {
    const { client, queries, emit } = fakeClient();
    const storage = withWatch(createMemoryStorage(), pgListenNotify(client));

    const seen: string[] = [];
    const off = await storage.watch("flags/", (e) => seen.push(e.key));
    expect(queries.some((q) => q.includes(`LISTEN "xtandard_flags"`))).toBe(true);

    emit("xtandard_flags", "flags/a"); // forwarded
    emit("other_ch", "flags/b"); // wrong channel, ignored
    expect(seen).toEqual(["flags/a"]);

    await off();
    expect(queries.some((q) => q.includes(`UNLISTEN "xtandard_flags"`))).toBe(true);
  });

  test("an explicit channel is honoured", async () => {
    const { client, queries } = fakeClient();
    const storage = withWatch(createMemoryStorage(), pgListenNotify(client, "flags_ch"));
    const off = await storage.watch("flags/", () => {});
    expect(queries.some((q) => q.includes(`LISTEN "flags_ch"`))).toBe(true);
    await off();
  });
});
