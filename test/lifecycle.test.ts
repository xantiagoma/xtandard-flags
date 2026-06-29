import { describe, expect, test } from "vitest";
import { flagStaleness, summarizeLifecycle } from "../src/lifecycle.ts";
import { createFlagsCore } from "../src/core.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, themeFlag } from "./fixtures.ts";

const NOW = "2026-06-29T00:00:00.000Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

describe("lifecycle — flagStaleness", () => {
  test("a flag without expectedLifetimeDays is never stale", () => {
    const f = booleanFlag({ createdAt: daysAgo(365), updatedAt: daysAgo(365) });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false);
  });

  test("old + idle + past expected lifetime → stale", () => {
    const f = booleanFlag({
      createdAt: daysAgo(120),
      updatedAt: daysAgo(30),
      expectedLifetimeDays: 90,
    });
    const r = flagStaleness(f, { now: NOW });
    expect(r.stale).toBe(true);
    expect(r.ageDays).toBe(120);
    expect(r.idleDays).toBe(30);
  });

  test("past lifetime but recently updated → not stale", () => {
    const f = booleanFlag({
      createdAt: daysAgo(120),
      updatedAt: daysAgo(2),
      expectedLifetimeDays: 90,
    });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false);
  });

  test("within expected lifetime → not stale", () => {
    const f = booleanFlag({
      createdAt: daysAgo(30),
      updatedAt: daysAgo(30),
      expectedLifetimeDays: 90,
    });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false);
  });

  test("archived flags are never stale", () => {
    const f = booleanFlag({
      createdAt: daysAgo(365),
      updatedAt: daysAgo(365),
      expectedLifetimeDays: 30,
      archivedAt: daysAgo(1),
    });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false);
  });

  test("falls back to createdAt when updatedAt is absent", () => {
    const f = booleanFlag({ createdAt: daysAgo(200), expectedLifetimeDays: 90 });
    const r = flagStaleness(f, { now: NOW });
    expect(r.idleDays).toBe(200);
    expect(r.stale).toBe(true);
  });

  test("custom idleDays threshold", () => {
    const f = booleanFlag({
      createdAt: daysAgo(120),
      updatedAt: daysAgo(10),
      expectedLifetimeDays: 90,
    });
    expect(flagStaleness(f, { now: NOW, idleDays: 30 }).stale).toBe(false);
    expect(flagStaleness(f, { now: NOW, idleDays: 5 }).stale).toBe(true);
  });

  test("unstamped flag yields null ages", () => {
    const r = flagStaleness(booleanFlag(), { now: NOW });
    expect(r).toEqual({ stale: false, ageDays: null, idleDays: null });
  });
});

describe("lifecycle — summarizeLifecycle", () => {
  test("counts active/archived/stale and computes a health score", () => {
    const flags = [
      booleanFlag({
        key: "a",
        createdAt: daysAgo(120),
        updatedAt: daysAgo(30),
        expectedLifetimeDays: 90,
      }), // stale
      themeFlag({ key: "b", createdAt: daysAgo(5), updatedAt: daysAgo(5) }), // fresh
      booleanFlag({ key: "c", archivedAt: daysAgo(1) }), // archived
    ];
    const s = summarizeLifecycle(flags, { now: NOW });
    expect(s).toEqual({ total: 3, active: 2, archived: 1, stale: 1, healthScore: 50 });
  });

  test("health score is 100 when there are no active flags", () => {
    const s = summarizeLifecycle([booleanFlag({ archivedAt: NOW })], { now: NOW });
    expect(s.healthScore).toBe(100);
  });
});

describe("lifecycle — core stamping", () => {
  test("upsertFlag stamps createdAt on first create and updatedAt on change", async () => {
    const core = createFlagsCore({ sourceStorage: createMemoryStorage() });
    const created = await core.upsertFlag(themeFlag());
    expect(typeof created.createdAt).toBe("string");
    expect(typeof created.updatedAt).toBe("string");

    const updated = await core.upsertFlag({ ...created, description: "changed" });
    expect(updated.createdAt).toBe(created.createdAt);
    // updatedAt is refreshed (monotonic non-decreasing)
    expect(Date.parse(updated.updatedAt!)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt!));
  });
});
