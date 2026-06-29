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
  .listen(3000);

console.log("Elysia listening on http://localhost:3000 (panel at /flags)");
