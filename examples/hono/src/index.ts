/**
 * Hono + @xtandard/flags embedded admin panel.
 *
 *   bun add hono @xtandard/flags
 *   bun run src/index.ts
 *
 * Open http://localhost:3000/flags
 */
import { Hono } from "hono";
import { flagsPanel } from "@xtandard/flags/hono";
import { createFileStorage } from "@xtandard/flags/storage/file";

const app = new Hono();

app.get("/", (c) => c.text("App is running. Admin panel at /flags"));

app.route(
  "/flags",
  flagsPanel({
    basePath: "/flags",
    title: "Acme Flags",
    sourceStorage: createFileStorage({ dir: "./.flags/source" }),
    runtimeStorage: createFileStorage({ dir: "./.flags/runtime" }),
  }),
);

export default { port: 3000, fetch: app.fetch };
console.log("Hono listening on http://localhost:3000 (panel at /flags)");
