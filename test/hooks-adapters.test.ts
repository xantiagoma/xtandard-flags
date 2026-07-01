import { describe, expect, test, vi } from "vitest";
import { createFlagsCore } from "../src/core.ts";
import { createLogHook } from "../src/hooks/log.ts";
import { createWebhookHook } from "../src/hooks/webhook.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag } from "./fixtures.ts";

const makeCore = (
  hooks: Parameters<typeof createFlagsCore>[0]["hooks"],
  onHookError?: () => void,
) => createFlagsCore({ sourceStorage: createMemoryStorage(), hooks, onHookError });

describe("hooks/log", () => {
  test("logs after events by default; not before", async () => {
    const lines: string[] = [];
    const core = makeCore(createLogHook({ log: (l) => lines.push(l) }));
    await core.upsertFlag(booleanFlag());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("after flag.upserted default/production");
  });

  test("includeBefore logs both phases", async () => {
    const lines: string[] = [];
    const core = makeCore(createLogHook({ log: (l) => lines.push(l), includeBefore: true }));
    await core.upsertFlag(booleanFlag());
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("before flag.upsert");
    expect(lines[1]).toContain("after flag.upserted");
  });

  test("custom format is honored", async () => {
    const lines: string[] = [];
    const core = makeCore(
      createLogHook({ log: (l) => lines.push(l), format: (phase, e) => `${phase}:${e.type}` }),
    );
    await core.upsertFlag(booleanFlag());
    expect(lines).toEqual(["after:flag.upserted"]);
  });
});

describe("hooks/webhook", () => {
  const okResponse = () => new Response(null, { status: 204 });

  test("POSTs the event as JSON to the url", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      okResponse(),
    );
    const core = makeCore(
      createWebhookHook({
        url: "https://hook.test/x",
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    );
    await core.upsertFlag(booleanFlag({ key: "f1" }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://hook.test/x");
    expect(init?.method).toBe("POST");
    const sent = JSON.parse(init!.body as string);
    expect(sent).toMatchObject({ type: "flag.upserted" });
  });

  test("signs the body with HMAC-SHA256 when a secret is set", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      okResponse(),
    );
    const core = makeCore(
      createWebhookHook({
        url: "https://hook.test/x",
        secret: "s3cr3t",
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    );
    await core.upsertFlag(booleanFlag());
    const init = fetchImpl.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    const sig = headers["x-flags-signature"];
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);

    // Recompute the HMAC over the exact body and compare.
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode("s3cr3t"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const raw = await crypto.subtle.sign("HMAC", key, enc.encode(init.body as string));
    const expected = [...new Uint8Array(raw)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(sig).toBe(`sha256=${expected}`);
  });

  test("filters by event type", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      okResponse(),
    );
    const core = makeCore(
      createWebhookHook({
        url: "https://hook.test/x",
        events: ["published"],
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    );
    await core.upsertFlag(booleanFlag()); // flag.upserted — filtered out
    expect(fetchImpl).not.toHaveBeenCalled();
    await core.publish({ message: "go" }); // published — delivered
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("retries on failure then succeeds; op is unaffected", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      calls++;
      if (calls < 3) throw new Error("network");
      return okResponse();
    });
    const onHookError = vi.fn();
    const core = makeCore(
      createWebhookHook({
        url: "https://hook.test/x",
        retryDelayMs: 0,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
      onHookError,
    );
    await core.upsertFlag(booleanFlag());
    expect(calls).toBe(3);
    expect(onHookError).not.toHaveBeenCalled();
  });

  test("gives up after maxAttempts; error routed to onHookError, op still succeeds", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 500 }),
    );
    const onHookError = vi.fn();
    const core = makeCore(
      createWebhookHook({
        url: "https://hook.test/x",
        maxAttempts: 2,
        retryDelayMs: 0,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
      onHookError,
    );
    const flag = await core.upsertFlag(booleanFlag());
    expect(flag.key).toBe("new-dashboard"); // mutation committed
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onHookError).toHaveBeenCalledTimes(1);
    expect(onHookError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});
