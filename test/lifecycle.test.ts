import { describe, expect, test } from "vitest";
import { flagStaleness, summarizeLifecycle } from "../src/lifecycle.ts";
import { createFlagsCore } from "../src/core.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import type { DurationUnit, LifecyclePolicy } from "../src/schema.ts";
import { booleanFlag, themeFlag } from "./fixtures.ts";

const NOW = "2026-06-29T00:00:00.000Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

/** Duration-expiry policy helper. */
const dur = (
  value: number,
  unit: DurationUnit = "days",
  from: "createdAt" | "updatedAt" = "createdAt",
  idle?: { value: number; unit: DurationUnit },
): LifecyclePolicy => ({ expiry: { kind: "duration", value, unit, from }, idle });

describe("lifecycle — flagStaleness (duration expiry)", () => {
  test("a flag without a lifecycle policy is never stale", () => {
    const f = booleanFlag({ createdAt: daysAgo(365), updatedAt: daysAgo(365) });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false);
  });

  test("old + idle + past expected lifetime → stale", () => {
    const f = booleanFlag({ createdAt: daysAgo(120), updatedAt: daysAgo(30), lifecycle: dur(90) });
    const r = flagStaleness(f, { now: NOW });
    expect(r.stale).toBe(true);
    expect(r.ageDays).toBe(120);
    expect(r.idleDays).toBe(30);
  });

  test("past lifetime but recently updated → not stale (idle grace)", () => {
    const f = booleanFlag({ createdAt: daysAgo(120), updatedAt: daysAgo(2), lifecycle: dur(90) });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false);
  });

  test("within expected lifetime → not stale", () => {
    const f = booleanFlag({ createdAt: daysAgo(30), updatedAt: daysAgo(30), lifecycle: dur(90) });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false);
  });

  test("non-day units (hours) work", () => {
    const f = booleanFlag({
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
      lifecycle: dur(1, "hours", "createdAt", { value: 1, unit: "hours" }),
    });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(true); // 48h old > 1h, idle 48h > 1h
  });

  test("anchor 'updatedAt' measures lifetime from the last edit", () => {
    const recent = booleanFlag({
      createdAt: daysAgo(300),
      updatedAt: daysAgo(10),
      lifecycle: dur(90, "days", "updatedAt"),
    });
    expect(flagStaleness(recent, { now: NOW }).stale).toBe(false);
  });

  test("per-flag idle grace overrides the default", () => {
    const f = booleanFlag({
      createdAt: daysAgo(120),
      updatedAt: daysAgo(10),
      lifecycle: dur(90, "days", "createdAt", { value: 30, unit: "days" }),
    });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false); // idle 10d < 30d grace
    const f2 = booleanFlag({
      createdAt: daysAgo(120),
      updatedAt: daysAgo(10),
      lifecycle: dur(90, "days", "createdAt", { value: 5, unit: "days" }),
    });
    expect(flagStaleness(f2, { now: NOW }).stale).toBe(true); // idle 10d > 5d grace
  });

  test("archived flags are never stale", () => {
    const f = booleanFlag({
      createdAt: daysAgo(365),
      updatedAt: daysAgo(365),
      lifecycle: dur(30),
      archivedAt: daysAgo(1),
    });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false);
  });

  test("falls back to createdAt when updatedAt is absent", () => {
    const f = booleanFlag({ createdAt: daysAgo(200), lifecycle: dur(90) });
    const r = flagStaleness(f, { now: NOW });
    expect(r.idleDays).toBe(200);
    expect(r.stale).toBe(true);
  });

  test("default idleDays option is used when the policy omits idle", () => {
    const f = booleanFlag({ createdAt: daysAgo(120), updatedAt: daysAgo(10), lifecycle: dur(90) });
    expect(flagStaleness(f, { now: NOW, idleDays: 30 }).stale).toBe(false);
    expect(flagStaleness(f, { now: NOW, idleDays: 5 }).stale).toBe(true);
  });

  test("unstamped flag yields null ages", () => {
    const r = flagStaleness(booleanFlag(), { now: NOW });
    expect(r).toEqual({ stale: false, ageDays: null, idleDays: null });
  });
});

describe("lifecycle — flagStaleness (datetime expiry)", () => {
  test("past the deadline → stale, even when freshly updated (hard deadline)", () => {
    const f = booleanFlag({
      createdAt: daysAgo(1),
      updatedAt: daysAgo(0),
      lifecycle: { expiry: { kind: "datetime", at: daysAgo(1) } },
    });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(true);
  });

  test("before the deadline → not stale", () => {
    const future = new Date(Date.parse(NOW) + 86_400_000).toISOString();
    const f = booleanFlag({ lifecycle: { expiry: { kind: "datetime", at: future } } });
    expect(flagStaleness(f, { now: NOW }).stale).toBe(false);
  });
});

describe("lifecycle — summarizeLifecycle", () => {
  test("counts active/archived/stale and computes a health score", () => {
    const flags = [
      booleanFlag({
        key: "a",
        createdAt: daysAgo(120),
        updatedAt: daysAgo(30),
        lifecycle: dur(90),
      }),
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
    expect(Date.parse(updated.updatedAt!)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt!));
  });
});
