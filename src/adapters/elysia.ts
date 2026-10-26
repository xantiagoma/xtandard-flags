/**
 * Elysia adapter. Two ways to mount:
 *
 * 1. {@link flagsPanel} — a web-standard handler for `Elysia.mount(path, handler)`.
 *    Simplest, but opaque to Eden (the typed client can't see the routes).
 *
 *    ```ts
 *    new Elysia().mount("/flags", flagsPanel({ basePath: "/flags", sourceStorage }));
 *    ```
 *
 * 2. {@link flagsElysia} — a typed Elysia plugin that *declares* the admin routes,
 *    so **Eden treaty** infers them: `edenClient.flags.api.projects.get()`, etc.
 *    Each handler delegates to the same pipeline (auth/validation/logic reused).
 *
 *    ```ts
 *    import { treaty } from "@elysiajs/eden";
 *    const app = new Elysia().use(flagsElysia({ prefix: "/flags", sourceStorage }));
 *    const client = treaty<typeof app>("localhost:3000");
 *    await client.flags.api.projects.get();
 *    ```
 *
 * @module
 */

import { Elysia, t } from "elysia";
import {
  createPass,
  flagsPanel,
  type ElysiaFlagsHandler,
  type FlagsElysiaOptions,
  type FlagsPanelOptions,
} from "./elysia-shared.ts";

export { flagsPanel };
export type { ElysiaFlagsHandler, FlagsElysiaOptions, FlagsPanelOptions };

const envParams = t.Object({ projectKey: t.String(), environmentKey: t.String() });
const flagParams = t.Object({
  projectKey: t.String(),
  environmentKey: t.String(),
  flagKey: t.String(),
});

/**
 * Typed Elysia plugin exposing the admin API so the **Eden** client can call it
 * with full path/method/param typing (`edenClient.flags.api.projects.get()`).
 * Routes are declared for the typed surface; every handler delegates to the
 * shared fetch pipeline (auth, authorization, validation, error mapping reused).
 * A catch-all also serves the bundled UI.
 *
 * Elysia 1.x only — for Elysia 2 import from `@xtandard/flags/elysia2`.
 */
export function flagsElysia(options: FlagsElysiaOptions) {
  const { prefix, pass } = createPass(options);

  const env = "/api/projects/:projectKey/environments/:environmentKey";

  return new Elysia({ prefix, name: "xtandard-flags" })
    .get("/config", pass)
    .get("/api/openapi.json", pass)
    .get("/api/projects", pass)
    .post("/api/projects", pass, {
      body: t.Object({ key: t.String(), name: t.Optional(t.String()) }),
    })
    .get("/api/projects/:projectKey/environments", pass, {
      params: t.Object({ projectKey: t.String() }),
    })
    .post("/api/projects/:projectKey/environments", pass, {
      params: t.Object({ projectKey: t.String() }),
      body: t.Object({ key: t.String(), name: t.Optional(t.String()) }),
    })
    .get(`${env}/flags`, pass, { params: envParams })
    .post(`${env}/flags`, pass, { params: envParams, body: t.Any() })
    .get(`${env}/flags/:flagKey`, pass, { params: flagParams })
    .put(`${env}/flags/:flagKey`, pass, { params: flagParams, body: t.Any() })
    .delete(`${env}/flags/:flagKey`, pass, { params: flagParams })
    .post(`${env}/flags/:flagKey/archive`, pass, { params: flagParams })
    .post(`${env}/flags/:flagKey/restore`, pass, { params: flagParams })
    .get(`${env}/segments`, pass, { params: envParams })
    .post(`${env}/segments`, pass, { params: envParams, body: t.Any() })
    .get(`${env}/segments/:segmentKey`, pass, {
      params: t.Object({
        projectKey: t.String(),
        environmentKey: t.String(),
        segmentKey: t.String(),
      }),
    })
    .put(`${env}/segments/:segmentKey`, pass, {
      params: t.Object({
        projectKey: t.String(),
        environmentKey: t.String(),
        segmentKey: t.String(),
      }),
      body: t.Any(),
    })
    .delete(`${env}/segments/:segmentKey`, pass, {
      params: t.Object({
        projectKey: t.String(),
        environmentKey: t.String(),
        segmentKey: t.String(),
      }),
    })
    .get(`${env}/draft`, pass, { params: envParams })
    .put(`${env}/draft`, pass, { params: envParams, body: t.Any() })
    .post(`${env}/publish`, pass, {
      params: envParams,
      body: t.Optional(t.Object({ message: t.Optional(t.String()) })),
    })
    .post(`${env}/rollback`, pass, {
      params: envParams,
      body: t.Object({ version: t.String(), message: t.Optional(t.String()) }),
    })
    .get(`${env}/snapshots`, pass, { params: envParams })
    .get(`${env}/snapshots/:version`, pass, {
      params: t.Object({ projectKey: t.String(), environmentKey: t.String(), version: t.String() }),
    })
    .get(`${env}/active`, pass, { params: envParams })
    .get(`${env}/audit`, pass, { params: envParams })
    .post(`${env}/evaluate`, pass, {
      params: envParams,
      body: t.Object({
        context: t.Optional(t.Record(t.String(), t.Unknown())),
        flagKey: t.Optional(t.String()),
        source: t.Optional(t.Union([t.Literal("draft"), t.Literal("active")])),
      }),
    })
    .post(`${env}/bootstrap`, pass, {
      params: envParams,
      body: t.Optional(
        t.Object({
          context: t.Optional(t.Record(t.String(), t.Unknown())),
          source: t.Optional(t.Union([t.Literal("draft"), t.Literal("active")])),
        }),
      ),
    })
    .all("/*", pass); // bundled UI assets + SPA fallback
}
