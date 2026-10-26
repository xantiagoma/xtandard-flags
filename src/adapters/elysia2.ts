/**
 * Elysia **2.x** adapter — same surface as `@xtandard/flags/elysia`, built
 * against Elysia 2's types and its `(path, hook, handler)` route order. Use
 * `@xtandard/flags/elysia` for Elysia 1.x.
 *
 * ```ts
 * new Elysia().mount("/flags", flagsPanel({ basePath: "/flags", sourceStorage }));
 * // or, typed for Eden treaty:
 * const app = new Elysia().use(flagsElysia({ prefix: "/flags", sourceStorage }));
 * ```
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
 * Elysia 2.x only — for Elysia 1.x import from `@xtandard/flags/elysia`.
 */
export function flagsElysia(options: FlagsElysiaOptions) {
  const { prefix, pass } = createPass(options);

  const env = "/api/projects/:projectKey/environments/:environmentKey";

  return new Elysia({ prefix, name: "xtandard-flags" })
    .get("/config", pass)
    .get("/api/openapi.json", pass)
    .get("/api/projects", pass)
    .post(
      "/api/projects",
      {
        body: t.Object({ key: t.String(), name: t.Optional(t.String()) }),
      },
      pass,
    )
    .get(
      "/api/projects/:projectKey/environments",
      {
        params: t.Object({ projectKey: t.String() }),
      },
      pass,
    )
    .post(
      "/api/projects/:projectKey/environments",
      {
        params: t.Object({ projectKey: t.String() }),
        body: t.Object({ key: t.String(), name: t.Optional(t.String()) }),
      },
      pass,
    )
    .get(`${env}/flags`, { params: envParams }, pass)
    .post(`${env}/flags`, { params: envParams, body: t.Any() }, pass)
    .get(`${env}/flags/:flagKey`, { params: flagParams }, pass)
    .put(`${env}/flags/:flagKey`, { params: flagParams, body: t.Any() }, pass)
    .delete(`${env}/flags/:flagKey`, { params: flagParams }, pass)
    .post(`${env}/flags/:flagKey/archive`, { params: flagParams }, pass)
    .post(`${env}/flags/:flagKey/restore`, { params: flagParams }, pass)
    .get(`${env}/segments`, { params: envParams }, pass)
    .post(`${env}/segments`, { params: envParams, body: t.Any() }, pass)
    .get(
      `${env}/segments/:segmentKey`,
      {
        params: t.Object({
          projectKey: t.String(),
          environmentKey: t.String(),
          segmentKey: t.String(),
        }),
      },
      pass,
    )
    .put(
      `${env}/segments/:segmentKey`,
      {
        params: t.Object({
          projectKey: t.String(),
          environmentKey: t.String(),
          segmentKey: t.String(),
        }),
        body: t.Any(),
      },
      pass,
    )
    .delete(
      `${env}/segments/:segmentKey`,
      {
        params: t.Object({
          projectKey: t.String(),
          environmentKey: t.String(),
          segmentKey: t.String(),
        }),
      },
      pass,
    )
    .get(`${env}/draft`, { params: envParams }, pass)
    .put(`${env}/draft`, { params: envParams, body: t.Any() }, pass)
    .post(
      `${env}/publish`,
      {
        params: envParams,
        body: t.Optional(t.Object({ message: t.Optional(t.String()) })),
      },
      pass,
    )
    .post(
      `${env}/rollback`,
      {
        params: envParams,
        body: t.Object({ version: t.String(), message: t.Optional(t.String()) }),
      },
      pass,
    )
    .get(`${env}/snapshots`, { params: envParams }, pass)
    .get(
      `${env}/snapshots/:version`,
      {
        params: t.Object({
          projectKey: t.String(),
          environmentKey: t.String(),
          version: t.String(),
        }),
      },
      pass,
    )
    .get(`${env}/active`, { params: envParams }, pass)
    .get(`${env}/audit`, { params: envParams }, pass)
    .post(
      `${env}/evaluate`,
      {
        params: envParams,
        body: t.Object({
          context: t.Optional(t.Record(t.String(), t.Unknown())),
          flagKey: t.Optional(t.String()),
          source: t.Optional(t.Union([t.Literal("draft"), t.Literal("active")])),
        }),
      },
      pass,
    )
    .post(
      `${env}/bootstrap`,
      {
        params: envParams,
        body: t.Optional(
          t.Object({
            context: t.Optional(t.Record(t.String(), t.Unknown())),
            source: t.Optional(t.Union([t.Literal("draft"), t.Literal("active")])),
          }),
        ),
      },
      pass,
    )
    .all("/*", pass); // bundled UI assets + SPA fallback
}
