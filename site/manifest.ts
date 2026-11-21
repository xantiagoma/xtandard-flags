// The site's information architecture: which repository Markdown becomes which page, and the
// sidebar tree (see `defineSiteManifest` in @xtandard/kit/site). scripts/sync.ts and
// astro.config.ts both read it, so a page and its sidebar entry cannot drift.
//
// The Markdown in the repository (README.md, docs/*.md) stays the single source of truth: it is
// what GitHub and npm render. A page is a whole repository file (`src`), some H2 sections of one
// (`src` + `sections`, optionally `intro`; every H2 of a split file must land on exactly one
// page), or a page written for the site only (`site`, relative to site/content/).
import { fileURLToPath } from "node:url";
import { defineSiteManifest, type SiteItem, type SitePage } from "@xtandard/kit/site";

/** The architecture decision records, docs/ADR/NNNN-*.md, in number order. */
const adrs: SitePage[] = [
  ["0001-single-package-subpath-exports", "0001 · Single package, subpath exports"],
  ["0002-memory-first-runtime-evaluation", "0002 · Memory-first runtime evaluation"],
  ["0003-bundled-spa-ui", "0003 · Bundled SPA UI"],
  ["0004-ofrep-endpoint", "0004 · OFREP endpoint"],
  ["0005-ui-routing", "0005 · UI routing"],
  ["0006-segment-resolution", "0006 · Segment resolution"],
  ["0007-pluggable-comparators", "0007 · Pluggable comparators"],
  ["0008-query-matchers", "0008 · Query matchers"],
  ["0009-condition-groups", "0009 · Condition groups"],
  ["0010-scheduled-active-window", "0010 · Scheduled active window"],
  ["0011-snapshot-import-export", "0011 · Snapshot import/export"],
].map(([file, label]) => ({
  slug: `project/adr/${file!.slice(0, 4)}`,
  src: `docs/ADR/${file}.md`,
  label,
  description: `Architecture decision record ${label!.replace(" · ", ": ")}: its context, the decision and its consequences.`,
}));

const sidebar: SiteItem[] = [
  {
    label: "Start here",
    items: [
      {
        slug: "why",
        src: "README.md",
        sections: ["Why another flag tool?", "How it works — the two planes"],
        title: "Why @xtandard/flags",
        label: "Why & how it works",
      },
      {
        slug: "quickstart",
        src: "README.md",
        sections: ["Quickstart"],
        title: "Quickstart",
        description:
          "Install @xtandard/flags, run the standalone server (Docker, npx or bunx), or embed the admin panel in Elysia, Hono or Express.",
      },
      { slug: "getting-started", src: "docs/GETTING_STARTED.md", label: "Getting started" },
      {
        slug: "entry-points",
        src: "README.md",
        sections: ["Subpath exports"],
        title: "Entry points (subpath exports)",
        label: "Entry points",
        description:
          "Every @xtandard/flags subpath export: storage adapters, Drizzle tables, hooks, auth and authorization providers, framework adapters, React and testing.",
      },
      {
        slug: "examples",
        src: "README.md",
        sections: ["Examples"],
        title: "Examples",
      },
    ],
  },
  {
    label: "Concepts",
    items: [
      { slug: "concepts/architecture", src: "docs/ARCHITECTURE.md", label: "Architecture" },
      {
        slug: "concepts/flag-model",
        src: "README.md",
        sections: ["The flag model"],
        title: "The flag model",
      },
      { slug: "concepts/operators", src: "docs/OPERATORS.md", label: "Condition operators" },
    ],
  },
  {
    label: "Evaluation",
    items: [
      {
        slug: "evaluation",
        src: "README.md",
        sections: ["Evaluate flags at runtime (OpenFeature)"],
        title: "Evaluate flags at runtime",
        label: "Overview",
      },
      {
        slug: "evaluation/openfeature",
        src: "docs/OPENFEATURE.md",
        intro: true,
        sections: [
          "Install",
          "Quick Start",
          "Provider Options",
          "The Four Typed Resolve Methods",
          "Reason and Error Code Mapping",
          "Memory-First and Refresh Semantics",
          "Failure Modes",
          "Zero Runtime Dependency on the SDK",
          "Extra Surface on `XtandardOpenFeatureProvider`",
        ],
        label: "OpenFeature provider",
      },
      {
        slug: "evaluation/ofrep",
        src: "docs/OPENFEATURE.md",
        sections: ["Remote evaluation (OFREP)"],
        title: "Remote evaluation (OFREP)",
        label: "Remote evaluation (OFREP)",
      },
    ],
  },
  {
    label: "Storage",
    items: [
      {
        slug: "storage",
        src: "docs/STORAGE.md",
        intro: true,
        sections: [
          "The `FlagsStorage` Contract",
          "Official Adapters",
          "Source vs Runtime Guidance",
          "Choosing a backend",
        ],
        label: "Overview",
      },
      {
        slug: "storage/databases",
        src: "docs/STORAGE.md",
        title: "Storage: SQL and document databases",
        sections: [
          "Postgres (`@xtandard/flags/storage/postgres`)",
          "Drizzle (`@xtandard/flags/storage/drizzle`)",
          "MongoDB (`@xtandard/flags/storage/mongodb`)",
          "SQLite (`@xtandard/flags/storage/sqlite`) — Bun only",
          "libSQL / Turso (`@xtandard/flags/storage/libsql`)",
        ],
        label: "SQL & document databases",
      },
      {
        slug: "storage/kv",
        src: "docs/STORAGE.md",
        title: "Storage: unstorage and Cloudflare KV",
        sections: [
          "unstorage driver ecosystem (`@xtandard/flags/storage/unstorage`)",
          "Cloudflare Workers KV (`@xtandard/flags/storage/cloudflare-kv`)",
        ],
        label: "unstorage & Cloudflare KV",
      },
      {
        slug: "storage/change-notifications",
        src: "docs/STORAGE.md",
        sections: ["Change notifications (`withWatch`)"],
        title: "Storage: change notifications",
        label: "Change notifications",
      },
      {
        slug: "storage/custom-adapter",
        src: "docs/STORAGE.md",
        sections: ["Implementing a Custom Adapter"],
        title: "Storage: a custom adapter",
        label: "Custom adapter",
      },
    ],
  },
  {
    label: "Integrations",
    items: [
      {
        slug: "integrations/adapters",
        src: "docs/ADAPTERS.md",
        intro: true,
        sections: [
          "Elysia — `@xtandard/flags/elysia`",
          "Hono — `@xtandard/flags/hono`",
          "Bun — `@xtandard/flags/bun`",
          "`FlagsPanelOptions` Reference",
          "Express (`@xtandard/flags/express`)",
        ],
        label: "Framework adapters",
      },
      {
        slug: "integrations/typed-elysia",
        src: "docs/ADAPTERS.md",
        title: "Typed Elysia, Eden and OpenAPI",
        sections: [
          "Typed Elysia plugin + Eden client (`flagsElysia`)",
          "OpenAPI",
          "Elysia 2 — `@xtandard/flags/elysia2`",
        ],
        label: "Typed Elysia, Eden & OpenAPI",
      },
      {
        slug: "integrations/fetch-handler",
        src: "docs/ADAPTERS.md",
        title: "The fetch handler and custom adapters",
        sections: [
          "`createFetchHandler` — The Underlying Primitive",
          "Writing a Thin Adapter for Any Fetch-Based Framework",
        ],
        label: "Fetch handler & custom adapters",
      },
      { slug: "integrations/hooks", src: "docs/HOOKS.md", label: "Hooks" },
    ],
  },
  {
    label: "Access control",
    items: [
      { slug: "access/authentication", src: "docs/AUTH.md", label: "Authentication" },
      { slug: "access/authorization", src: "docs/AUTHORIZATION.md", label: "Authorization" },
    ],
  },
  {
    label: "Admin UI",
    items: [
      {
        slug: "ui",
        src: "docs/UI.md",
        intro: true,
        sections: [
          "Bundled SPA Model",
          "Served Routes",
          "Routing (wouter, pluggable)",
          "Snapshots: download / import",
          "Branding",
          "One-command demo",
          "Building the UI",
          "`basePath` and `window.__FLAGS_CONFIG__`",
          "No React Peer for Consumers",
          "Custom UI Directory",
          "Fallback Page",
        ],
        label: "Overview",
      },
      {
        slug: "ui/react",
        src: "docs/UI.md",
        sections: ["Advanced: embed as a React component (`@xtandard/flags/react`)"],
        title: "Embed as a React component",
        label: "Embed in React",
      },
      {
        slug: "ui/screenshots",
        src: "README.md",
        sections: ["Screenshots"],
        title: "Screenshots",
        description:
          "The admin UI: the flag editor, snapshots with download/import, the publish diff and the audit log.",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { slug: "operations/deployment", src: "docs/DEPLOYMENT.md", label: "Deployment" },
      {
        slug: "operations/cli",
        src: "README.md",
        sections: ["CLI"],
        title: "CLI",
        description:
          "The xtandard-flags CLI: serve the panel, and init, list, validate, publish, roll back and inspect flags in your storage.",
      },
      { slug: "operations/testing", src: "docs/TESTING.md", label: "Testing" },
    ],
  },
  // starlight-typedoc's "API reference" group is inserted before this one by astro.config.ts.
  {
    label: "Project",
    items: [
      {
        slug: "project/ecosystem",
        src: "README.md",
        sections: ["The xtandard ecosystem"],
        title: "The xtandard ecosystem",
        label: "xtandard ecosystem",
      },
      {
        slug: "project/status",
        src: "README.md",
        sections: ["Project status"],
        title: "Project status",
      },
      {
        slug: "project/changelog",
        src: "CHANGELOG.md",
        label: "Changelog",
        description:
          "What changed in each @xtandard/flags release, generated from conventional commits.",
      },
      { slug: "project/brand", src: "docs/BRAND.md", label: "Brand" },
      { label: "Architecture decisions", collapsed: true, items: adrs },
      { slug: "project/releases", src: "docs/RELEASES.md", label: "Releases", internal: true },
      { label: "npm", link: "https://www.npmjs.com/package/@xtandard/flags" },
    ],
  },
];

export const manifest = defineSiteManifest({
  repoRoot: fileURLToPath(new URL("../", import.meta.url)),
  repoSlug: "xantiagoma/xtandard-flags",
  packageName: "@xtandard/flags",
  rootModule: "flags",
  base: "/xtandard-flags",
  sidebar,
});
