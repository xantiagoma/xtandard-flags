/**
 * Elysia + @xtandard/flags embedded admin panel.
 *
 *   bun add elysia @xtandard/flags
 *   bun run src/index.ts
 *
 * Open http://localhost:3000/flags
 */
import { Elysia } from "elysia";
import { flagsPanel } from "@xtandard/flags/elysia";
import { createFileStorage } from "@xtandard/flags/storage/file";

const port = Number(process.env.PORT) || 3000;

new Elysia()
  .get("/", () => "App is running. Admin panel at /flags")
  .mount(
    "/flags",
    flagsPanel({
      basePath: "/flags",
      title: "Acme Flags",
      // Swap for createRedisStorage / createUnstorageStorage in production.
      sourceStorage: createFileStorage({ dir: "./.flags/source" }),
      runtimeStorage: createFileStorage({ dir: "./.flags/runtime" }),
    }),
  )
  .listen(port);

console.log(`Elysia listening on http://localhost:${port} (panel at /flags)`);
