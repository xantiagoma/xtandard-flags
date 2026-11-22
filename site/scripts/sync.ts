// Pre-build step: writes src/content/docs/ (generated, gitignored) from the repository's Markdown,
// per manifest.ts (see `syncSite` in @xtandard/kit/site).
//
//   bun scripts/sync.ts
import { runSync } from "@xtandard/kit/site";
import { manifest } from "../manifest.ts";

process.exit(runSync(manifest));
