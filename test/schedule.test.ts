import { describe, expect, test } from "vitest";
import { evaluateFlag } from "../src/evaluator.ts";
import type { Flag } from "../src/schema.ts";
import { booleanFlag } from "./fixtures.ts";

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-06-15T00:00:00Z");
const past = "2026-01-01T00:00:00Z";
const future = "2026-12-01T00:00:00Z";

// A flag that, when live, serves "on" via a rule — so we can tell "served because
// scheduled off" (reason SCHEDULED/EXPIRED, variant off) from a live evaluation.
const scheduledFlag = (schedule: Flag["schedule"]): Flag =>
  booleanFlag({
    enabled: true,
    defaultVariant: "off",
    fallthrough: { variant: "on" },
    schedule,
  });

describe("schedule — active window", () => {
  test("within the window evaluates normally", () => {
    const r = evaluateFlag(
      scheduledFlag({ enableAt: past, disableAt: future }),
      { targetingKey: "u" },
      {},
      {},
      NOW,
    );
    expect(r.variant).toBe("on");
    expect(r.reason).toBe("STATIC");
  });

  test("after disableAt → default variant, reason EXPIRED", () => {
    const r = evaluateFlag(scheduledFlag({ disableAt: past }), { targetingKey: "u" }, {}, {}, NOW);
    expect(r.variant).toBe("off");
    expect(r.reason).toBe("EXPIRED");
  });

  test("before enableAt → default variant, reason SCHEDULED", () => {
    const r = evaluateFlag(scheduledFlag({ enableAt: future }), { targetingKey: "u" }, {}, {}, NOW);
    expect(r.variant).toBe("off");
    expect(r.reason).toBe("SCHEDULED");
  });

  test("manual disable wins over schedule (reason DISABLED)", () => {
    const f = scheduledFlag({ disableAt: past });
    const r = evaluateFlag({ ...f, enabled: false }, { targetingKey: "u" }, {}, {}, NOW);
    expect(r.reason).toBe("DISABLED");
  });

  test("no schedule → unaffected", () => {
    const r = evaluateFlag(scheduledFlag(undefined), { targetingKey: "u" }, {}, {}, NOW);
    expect(r.reason).toBe("STATIC");
  });

  test("unparseable bounds are ignored (stays live)", () => {
    const r = evaluateFlag(
      scheduledFlag({ enableAt: "nonsense", disableAt: "also-bad" }),
      { targetingKey: "u" },
      {},
      {},
      NOW,
    );
    expect(r.reason).toBe("STATIC");
  });

  test("defaults to the current time when `now` is omitted", () => {
    // disableAt in the past relative to real now → expired.
    const r = evaluateFlag(scheduledFlag({ disableAt: "2000-01-01T00:00:00Z" }), {
      targetingKey: "u",
    });
    expect(r.reason).toBe("EXPIRED");
  });
});

describe("schedule — composes with prerequisites", () => {
  test("an expired prerequisite makes the dependent flag fail its prereq", () => {
    const gate = scheduledFlag({ disableAt: past }); // expired → serves default "off"
    gate.key = "gate";
    const dependent = booleanFlag({
      key: "dependent",
      enabled: true,
      defaultVariant: "off",
      fallthrough: { variant: "on" },
      prerequisites: [{ flagKey: "gate", variant: "on" }], // needs gate=on, but gate is expired→off
    });
    const r = evaluateFlag(dependent, { targetingKey: "u" }, { gate, dependent }, {}, NOW);
    expect(r.reason).toBe("PREREQUISITE_FAILED");
  });
});
