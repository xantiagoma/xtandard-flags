// The documentation site, on @xtandard/kit/site: Starlight over the repository's Markdown
// (scripts/sync.ts copies it into src/content/docs/ first), a TypeDoc API reference with one module
// per `exports` entry, and Mermaid diagrams. manifest.ts holds the information architecture.
// `bun run build` writes dist/ here; pages.yml publishes it.
import { defineXtandardSite } from "@xtandard/kit/site";
import { manifest } from "./manifest.ts";

export default await defineXtandardSite({
  manifest,
  description:
    "Self-hosted, embeddable, OpenFeature-compatible feature-flag control plane with pluggable storage and memory-first runtime evaluation.",
  tagline: "Self-hosted, embeddable, OpenFeature feature flags",
  // TypeDoc documents a symbol exported by several entry points under the first one it meets, so
  // the focused modules come first and own their symbols (`evaluate` on /api/evaluator/, the flag
  // types on /api/schema/); the root `@xtandard/flags` then owns what only it gathers
  // (`createFetchHandler`, validation…), and the framework adapters, which re-export
  // `FlagsPanelOptions`, come after it.
  apiOwners: [
    "src/schema.ts",
    "src/evaluator.ts",
    "src/snapshot.ts",
    "src/core.ts",
    "src/openfeature.ts",
    "src/index.ts",
  ],
  devPort: 4322,
});
