// The documentation site: Astro Starlight over the repository's Markdown (scripts/sync.ts copies it
// into src/content/docs/ first), a TypeDoc API reference generated from src/ (starlight-typedoc),
// and Mermaid diagrams. site/manifest.ts holds the information architecture. `bun run build`
// writes dist/ here; pages.yml publishes it.
import { join } from "node:path";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";
import { createStarlightTypeDocPlugin } from "starlight-typedoc";
import { apiOverviews } from "./scripts/api-overviews.ts";
import {
  apiEntries,
  isGroup,
  isPage,
  npmUrl,
  repoRoot,
  repoUrl,
  sidebar,
  siteBase,
  siteOrigin,
  type Item,
} from "./manifest.ts";

type SidebarItem =
  | { slug: string; label?: string }
  | { label: string; link: string }
  | { label: string; collapsed?: boolean; items: SidebarItem[] };

const toSidebar = (items: Item[]): SidebarItem[] =>
  items.map((i) => {
    if (isPage(i)) return i.label ? { slug: i.slug, label: i.label } : { slug: i.slug };
    if (isGroup(i)) return { label: i.label, collapsed: i.collapsed, items: toSidebar(i.items) };
    return { label: i.label, link: i.link };
  });

/**
 * Entry points other entry points re-export from, in this order. TypeDoc documents a symbol
 * exported by several entry points under the first one it meets, so the focused modules come
 * first and own their symbols (`evaluate` on /api/evaluator/, the flag types on /api/schema/);
 * the root `@xtandard/flags` then owns what only it gathers (`createFetchHandler`, validation…),
 * and the framework adapters, which re-export `FlagsPanelOptions`, come after it.
 */
const apiOwners = [
  "src/schema.ts",
  "src/evaluator.ts",
  "src/snapshot.ts",
  "src/core.ts",
  "src/openfeature.ts",
  "src/index.ts",
];
const entrySources = apiEntries().map((e) => e.source);
for (const o of apiOwners)
  if (!entrySources.includes(o)) throw new Error(`astro.config.ts: ${o} is not an entry point`);

const [apiReference, apiSidebarGroup] = createStarlightTypeDocPlugin();
const items = toSidebar(sidebar);

export default defineConfig({
  site: siteOrigin,
  base: siteBase,
  trailingSlash: "ignore",
  telemetry: false,
  integrations: [
    // Must come before Starlight.
    mermaid({ theme: "neutral", autoTheme: true, enableLog: false }),
    starlight({
      title: "@xtandard/flags",
      description:
        "Self-hosted, embeddable, OpenFeature-compatible feature-flag control plane with pluggable storage and memory-first runtime evaluation.",
      logo: { src: "../docs/assets/logo-256.png", alt: "@xtandard/flags" },
      favicon: "/favicon.png",
      social: [
        { icon: "github", label: "GitHub", href: repoUrl },
        { icon: "npm", label: "npm", href: npmUrl },
      ],
      editLink: { baseUrl: `${repoUrl}/edit/main/` },
      lastUpdated: false,
      customCss: ["./src/styles/brand.css"],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      sidebar: [...items.slice(0, -1), apiSidebarGroup, ...items.slice(-1)],
      plugins: [
        apiReference({
          // A fixed order (see apiOwners), then the rest alphabetically: a glob's order differs
          // between file systems (macOS vs the Linux CI).
          entryPoints: [
            ...apiOwners,
            ...entrySources.filter((f) => !apiOwners.includes(f)).sort(),
          ].map((f) => join(repoRoot, f)),
          // The root tsconfig.json leaves out the Elysia 2 adapter (tsconfig.elysia2.json checks
          // it against Elysia 2); this one covers every entry point, src/ only.
          tsconfig: "./typedoc.tsconfig.json",
          output: "api",
          sidebar: { label: "API reference", collapsed: true },
          typeDoc: {
            plugin: ["typedoc-plugin-missing-exports"],
            // @ts-expect-error -- typedoc-plugin-missing-exports options
            placeInternalsInOwningModule: true,
            excludePrivate: true,
            excludeInternal: true,
            excludeExternals: true,
            disableGit: true,
            // tsc (`bun run typecheck`, CI) type-checks the project, tests included. TypeDoc only
            // documents src/, and its own check would trip on the Elysia 1/2 split.
            skipErrorChecking: true,
            // {path} is relative to src/ (the entry points' common directory).
            sourceLinkTemplate: `${repoUrl}/blob/main/src/{path}#L{line}`,
            useCodeBlocks: true,
            parametersFormat: "table",
            interfacePropertiesFormat: "table",
            classPropertiesFormat: "table",
            typeDeclarationFormat: "table",
            enumMembersFormat: "table",
          },
        }),
        // After starlight-typedoc (plugins run in order): the /api/ and /api/<module>/ pages.
        apiOverviews(),
        starlightLinksValidator({
          errorOnRelativeLinks: false,
          errorOnInvalidHashes: true,
        }),
      ],
    }),
  ],
});
