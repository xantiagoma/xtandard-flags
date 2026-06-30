/**
 * Express + @xtandard/flags embedded admin panel.
 *
 *   bun add express @xtandard/flags
 *   bun run src/index.ts
 *
 * Open http://localhost:3000/flags
 *
 * Mount the panel BEFORE any body-parsing middleware — it reads the raw body.
 */
import express from "express";
import { flagsPanel } from "@xtandard/flags/express";
import { createFileStorage } from "@xtandard/flags/storage/file";

const app = express();

// Panel first (raw body), then your own parsers/routes.
app.use(
  "/flags",
  flagsPanel({
    basePath: "/flags",
    title: "Acme Flags",
    sourceStorage: createFileStorage({ dir: "./.flags/source" }),
    runtimeStorage: createFileStorage({ dir: "./.flags/runtime" }),
  }),
);

app.get("/", (_req, res) => res.send("App is running. Admin panel at /flags"));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Express on http://localhost:${port} (panel at /flags)`));
