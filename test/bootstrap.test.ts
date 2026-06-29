import { describe, expect, test } from "vitest";
import { createFetchHandler } from "../src/server/create-fetch-handler.ts";
import { createMemoryStorage } from "../src/storage/memory.ts";
import { booleanFlag, themeFlag } from "./fixtures.ts";

const BASE = "/api/projects/default/environments/production";

const seedAndPublish = async () => {
  const { fetch } = createFetchHandler({ sourceStorage: createMemoryStorage() });
  const post = (path: string, body?: unknown) =>
    fetch(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: body !== undefined ? { "content-type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    );
  await post(`${BASE}/flags`, booleanFlag());
  await post(`${BASE}/flags`, themeFlag());
  await post(`${BASE}/publish`, {});
  return { fetch, post };
};

describe("bootstrap endpoint", () => {
  test("returns a keyed map of {value,variant,reason} from the active snapshot", async () => {
    const { post } = await seedAndPublish();
    const res = await post(`${BASE}/bootstrap`, { context: { targetingKey: "u1" } });
    expect(res.status).toBe(200);
    const { flags } = (await res.json()) as {
      flags: Record<string, { value: unknown; variant?: string; reason: string }>;
    };
    expect(Object.keys(flags).sort()).toEqual(["new-dashboard", "theme"]);
    expect(flags["new-dashboard"]).toMatchObject({ value: false, variant: "off" });
    expect(typeof flags.theme?.reason).toBe("string");
  });

  test("works with no body (empty context, active source)", async () => {
    const { fetch } = await seedAndPublish();
    const res = await fetch(new Request(`http://localhost${BASE}/bootstrap`, { method: "POST" }));
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()).flags).length).toBe(2);
  });

  test("archived flags do not appear in the bootstrap map", async () => {
    const { post } = await seedAndPublish();
    await post(`${BASE}/flags/theme/archive`);
    await post(`${BASE}/publish`, {});
    const res = await post(`${BASE}/bootstrap`, {});
    const { flags } = (await res.json()) as { flags: Record<string, unknown> };
    expect(Object.keys(flags)).toEqual(["new-dashboard"]);
  });

  test("source:draft evaluates the unpublished draft", async () => {
    const { fetch, post } = await seedAndPublish();
    // add a draft-only flag, do NOT publish
    await post(`${BASE}/flags`, booleanFlag({ key: "draft-only" }));
    const active = await (await post(`${BASE}/bootstrap`, {})).json();
    expect(Object.keys(active.flags)).not.toContain("draft-only");
    const draft = await (
      await fetch(
        new Request(`http://localhost${BASE}/bootstrap`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "draft" }),
        }),
      )
    ).json();
    expect(Object.keys(draft.flags)).toContain("draft-only");
  });
});
