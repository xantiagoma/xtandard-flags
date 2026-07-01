import { describe, expect, test } from "vitest";
import { createFlagsCore } from "../src/core.ts";
import { HookDeniedError } from "../src/hooks/contract.ts";
import { createTestGate, runFlagTests } from "../src/hooks/test-gate.ts";
import { compileDraft } from "../src/snapshot.ts";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { validateFlag } from "../src/validation.ts";
import type { Flag } from "../src/schema.ts";
import { themeFlag } from "./fixtures.ts";

/** themeFlag + a "vip" override → xmas, with pinned tests. */
const themedWithTests = (tests: Flag["tests"]): Flag =>
  themeFlag({ overrides: [{ targetingKey: "vip", variant: "xmas" }], tests });

const makeCore = (hook = createTestGate()) =>
  createFlagsCore({ sourceStorage: createMemoryStorage(), hooks: hook });

describe("test-gate — runFlagTests (pure)", () => {
  test("no failures when expectations hold", () => {
    const flag = themedWithTests([
      { name: "vip gets xmas", context: { targetingKey: "vip" }, expect: { variant: "xmas" } },
      { name: "others default", context: { targetingKey: "joe" }, expect: { variant: "normal" } },
    ]);
    expect(runFlagTests({ theme: flag }, {})).toEqual([]);
  });

  test("reports a variant mismatch", () => {
    const flag = themedWithTests([
      { name: "wrong", context: { targetingKey: "joe" }, expect: { variant: "xmas" } },
    ]);
    const failures = runFlagTests({ theme: flag }, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ flagKey: "theme", index: 0, name: "wrong" });
    expect(failures[0]?.message).toContain('expected variant "xmas"');
  });

  test("checks value expectations too", () => {
    const flag = themedWithTests([
      { context: { targetingKey: "vip" }, expect: { value: "xmas" } },
      { context: { targetingKey: "vip" }, expect: { value: "normal" } }, // wrong
    ]);
    const failures = runFlagTests({ theme: flag }, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]?.index).toBe(1);
  });

  test("flags without tests are ignored", () => {
    expect(runFlagTests({ theme: themeFlag() }, {})).toEqual([]);
  });
});

describe("test-gate — publish gate", () => {
  test("passing tests allow publish", async () => {
    const core = makeCore();
    await core.upsertFlag(
      themedWithTests([{ context: { targetingKey: "vip" }, expect: { variant: "xmas" } }]),
    );
    const snap = await core.publish({ message: "ok" });
    expect(snap.version).toBe("v1");
  });

  test("failing tests deny publish with HookDeniedError and nothing is published", async () => {
    const core = makeCore();
    await core.upsertFlag(
      themedWithTests([
        { name: "bad", context: { targetingKey: "joe" }, expect: { variant: "xmas" } },
      ]),
    );
    await expect(core.publish({ message: "nope" })).rejects.toBeInstanceOf(HookDeniedError);
    expect(await core.getActiveVersion()).toBeNull();
  });

  test("denial message names the failing case", async () => {
    const core = makeCore();
    await core.upsertFlag(
      themedWithTests([
        { name: "vip flow", context: { targetingKey: "joe" }, expect: { variant: "xmas" } },
      ]),
    );
    await expect(core.publish({ message: "x" })).rejects.toThrow(/Publish blocked.*vip flow/s);
  });

  test("via the panel, a failing gate returns 422 HOOK_DENIED", async () => {
    const { fetch, core } = createFetchHandler({
      sourceStorage: createMemoryStorage(),
      hooks: createTestGate(),
    });
    await core.upsertFlag(
      themedWithTests([{ context: { targetingKey: "joe" }, expect: { variant: "xmas" } }]),
    );
    const res = await fetch(
      new Request("http://localhost/api/projects/default/environments/production/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "HOOK_DENIED" });
  });
});

describe("test-gate — schema & snapshot", () => {
  test("tests are stripped from the compiled snapshot", () => {
    const flag = themedWithTests([
      { context: { targetingKey: "vip" }, expect: { variant: "xmas" } },
    ]);
    const snap = compileDraft(
      { projectKey: "default", environmentKey: "production", flags: { theme: flag } },
      { version: "v1" },
    );
    expect(snap.flags.theme?.tests).toBeUndefined();
    // The rest of the flag is intact.
    expect(snap.flags.theme?.overrides).toEqual([{ targetingKey: "vip", variant: "xmas" }]);
  });

  test("validation rejects a test with no expectation", () => {
    const flag = themedWithTests([{ context: { targetingKey: "vip" }, expect: {} }]);
    const result = validateFlag(flag);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("tests[0].expect"))).toBe(true);
  });

  test("validation rejects a test expecting an unknown variant", () => {
    const flag = themedWithTests([
      { context: { targetingKey: "vip" }, expect: { variant: "ghost" } },
    ]);
    const result = validateFlag(flag);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('unknown variant "ghost"'))).toBe(true);
  });
});
