import { describe, expect, test, vi } from "vitest";
import { createFlagsCore } from "../src/core.ts";
import { emitEvaluation, type EvaluationEvent } from "../src/evaluation-sink.ts";
import { createOpenFeatureProvider } from "../src/openfeature.ts";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { SnapshotStore } from "../src/snapshot.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, draft, themeFlag } from "./fixtures.ts";

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

describe("emitEvaluation (safe dispatch)", () => {
  const event: EvaluationEvent = {
    flagKey: "f",
    value: true,
    reason: "STATIC",
    context: {},
    projectKey: "default",
    environmentKey: "production",
    source: "provider",
    at: "2026-01-01T00:00:00.000Z",
  };

  test("delivers the event", () => {
    const seen: EvaluationEvent[] = [];
    emitEvaluation((e) => {
      seen.push(e);
    }, event);
    expect(seen).toEqual([event]);
  });

  test("a synchronous throw is routed to onError, not rethrown", () => {
    const onError = vi.fn();
    const err = new Error("boom");
    expect(() =>
      emitEvaluation(
        () => {
          throw err;
        },
        event,
        onError,
      ),
    ).not.toThrow();
    expect(onError).toHaveBeenCalledWith(err, event);
  });

  test("an async rejection is routed to onError", async () => {
    const onError = vi.fn();
    emitEvaluation(() => Promise.reject(new Error("async boom")), event, onError);
    await flushMicrotasks();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("provider onEvaluation", () => {
  async function publish(flags = [booleanFlag(), themeFlag()]) {
    const storage = createMemoryStorage();
    await new SnapshotStore(storage).publish(draft(flags));
    return storage;
  }

  test("emits one event per evaluation with source=provider", async () => {
    const events: EvaluationEvent[] = [];
    const storage = await publish();
    const provider = createOpenFeatureProvider({
      storage,
      refreshIntervalMs: 0,
      onEvaluation: (e) => {
        events.push(e);
      },
    });
    await provider.initialize();

    await provider.resolveBooleanEvaluation("new-dashboard", true, { targetingKey: "u1" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      flagKey: "new-dashboard",
      value: false,
      variant: "off",
      reason: "STATIC",
      source: "provider",
      projectKey: "default",
      environmentKey: "production",
    });
    expect(events[0]?.context).toMatchObject({ targetingKey: "u1" });
  });

  test("emits for error outcomes too (unknown flag)", async () => {
    const events: EvaluationEvent[] = [];
    const provider = createOpenFeatureProvider({
      storage: await publish(),
      refreshIntervalMs: 0,
      onEvaluation: (e) => {
        events.push(e);
      },
    });
    await provider.initialize();
    await provider.resolveBooleanEvaluation("ghost", true, {});
    expect(events[0]).toMatchObject({ flagKey: "ghost", value: true, reason: "ERROR" });
  });

  test("a throwing sink never breaks the evaluation; onEvaluationError is called", async () => {
    const onEvaluationError = vi.fn();
    const provider = createOpenFeatureProvider({
      storage: await publish(),
      refreshIntervalMs: 0,
      onEvaluation: () => {
        throw new Error("sink down");
      },
      onEvaluationError,
    });
    await provider.initialize();
    const r = await provider.resolveBooleanEvaluation("new-dashboard", true, {});
    expect(r.value).toBe(false); // evaluation unaffected
    expect(onEvaluationError).toHaveBeenCalledTimes(1);
  });

  test("no sink configured is a no-op", async () => {
    const provider = createOpenFeatureProvider({ storage: await publish(), refreshIntervalMs: 0 });
    await provider.initialize();
    const r = await provider.resolveBooleanEvaluation("new-dashboard", true, {});
    expect(r.value).toBe(false);
  });
});

describe("OFREP onEvaluation", () => {
  const req = (path: string, body: unknown) =>
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  async function panelWithFlag() {
    const events: EvaluationEvent[] = [];
    const storage = createMemoryStorage();
    const { fetch, core } = createFetchHandler({
      sourceStorage: storage,
      onEvaluation: (e) => {
        events.push(e);
      },
    });
    await core.upsertFlag(booleanFlag());
    await core.upsertFlag(themeFlag());
    await core.publish({ message: "seed" });
    return { fetch, events };
  }

  test("single OFREP eval emits one event with source=ofrep", async () => {
    const { fetch, events } = await panelWithFlag();
    const res = await fetch(
      req("/ofrep/v1/evaluate/flags/new-dashboard", { context: { targetingKey: "u1" } }),
    );
    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      flagKey: "new-dashboard",
      source: "ofrep",
      reason: "STATIC",
    });
    expect(events[0]?.context).toMatchObject({ targetingKey: "u1" });
  });

  test("bulk OFREP eval emits one event per flag", async () => {
    const { fetch, events } = await panelWithFlag();
    const res = await fetch(req("/ofrep/v1/evaluate/flags", { context: { targetingKey: "u1" } }));
    expect(res.status).toBe(200);
    expect(events.map((e) => e.flagKey).sort()).toEqual(["new-dashboard", "theme"]);
    expect(events.every((e) => e.source === "ofrep")).toBe(true);
  });
});
