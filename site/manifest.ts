// The site's information architecture: which repository Markdown becomes which page, and the
// sidebar tree. scripts/sync.ts reads it to write src/content/docs/, and astro.config.ts reads it
// to build the sidebar, so a page and its sidebar entry cannot drift.
//
// The Markdown in the repository (README.md, docs/*.md) stays the single source of truth: it is
// what GitHub and npm render. A page is one of:
//   - a whole repository file (`src`);
//   - some H2 sections of one (`src` + `sections`, optionally `intro` for the text above the first
//     H2) — how the long guides are split into several pages. Every H2 of a split file must land
//     on exactly one page, so a new section cannot silently disappear from the site;
//   - a page written for the site only (`site`, relative to site/content/).
// Plain Node APIs only: Astro loads this file through Vite.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../", import.meta.url));
export const repoSlug = "xantiagoma/xtandard-flags";
export const repoUrl = `https://github.com/${repoSlug}`;
export const npmUrl = "https://www.npmjs.com/package/@xtandard/flags";
export const packageName = "@xtandard/flags";
export const branch = "main";
/**
 * Where the site is served: the project site of xantiagoma.github.io, under the account's custom
 * domain. pages.yml passes what actions/configure-pages reports (SITE_ORIGIN, SITE_BASE), so a
 * domain change needs no code change. configure-pages reports the custom domain as `http://`
 * (Pages serves it over https), which would put http URLs in og:url, og:image and the sitemap, so
 * the origin is upgraded to https.
 */
export const siteOrigin = (process.env.SITE_ORIGIN || "https://me.xantiagoma.com").replace(
  /^http:\/\//,
  "https://",
);
export const siteBase = (process.env.SITE_BASE || "/xtandard-flags").replace(/\/+$/, "");

export type Page = {
  /** Route without the base and without slashes; "" is the home page. */
  slug: string;
  /** Sidebar label; the page title when absent. */
  label?: string;
  /** Repository file the page is built from. */
  src?: string;
  /** Only these H2 sections of `src` (by heading text, in file order). */
  sections?: string[];
  /** With `sections`: also the H1 and the text above the first H2. */
  intro?: boolean;
  /** Page title when it does not come from the source's H1. */
  title?: string;
  /** Meta description when the first paragraph of the source does not make a good one. */
  description?: string;
  /** Site-only page in site/content/ (.md or .mdx). */
  site?: string;
  /** Contributor-only material: a banner says so and search skips it. */
  internal?: boolean;
};
export type Link = { label: string; link: string };
export type Group = { label: string; collapsed?: boolean; items: Item[] };
export type Item = Page | Link | Group;

export const home: Page = { slug: "", site: "index.mdx" };

/** The architecture decision records, docs/ADR/NNNN-*.md, in number order. */
const adrs: Page[] = [
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

export const sidebar: Item[] = [
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
      { label: "npm", link: npmUrl },
    ],
  },
];

/** A public entry point: its API reference module, import specifier and source file. */
export type ApiEntry = {
  /** TypeDoc module name (its `@module` tag) and route under /api/: the subpath, "flags" for the root. */
  name: string;
  importPath: string;
  /** Repository-relative source file. */
  source: string;
};

/**
 * Every public entry point, in package.json `exports` order. Skips the stylesheet, the bundled UI
 * assets (`./ui/*`) and `./package.json`. A subpath maps to `src/entry-<subpath with dashes>.ts`
 * when that file exists (`./storage/redis`), otherwise to `src/<subpath>.ts(x)` (`./core`, `./react`).
 */
export function apiEntries(): ApiEntry[] {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
  };
  return Object.keys(pkg.exports)
    .filter((key) => key !== "./package.json" && !key.includes("*") && !key.endsWith(".css"))
    .map((key) => {
      const sub = key.replace(/^\.\/?/, "");
      const candidates =
        sub === ""
          ? ["src/index.ts"]
          : [`src/entry-${sub.replaceAll("/", "-")}.ts`, `src/${sub}.ts`, `src/${sub}.tsx`];
      const source = candidates.find((f) => existsSync(join(repoRoot, f)));
      if (!source) throw new Error(`manifest.ts: no source file for the "${key}" export`);
      return {
        name: sub === "" ? "flags" : sub,
        importPath: sub === "" ? packageName : `${packageName}/${sub}`,
        source,
      };
    });
}

export const isPage = (i: Item): i is Page => "slug" in i;
export const isGroup = (i: Item): i is Group => "items" in i;

/** Every page, the home page first. */
export function pages(): Page[] {
  const out: Page[] = [home];
  const walk = (items: Item[]) => {
    for (const i of items) {
      if (isPage(i)) out.push(i);
      else if (isGroup(i)) walk(i.items);
    }
  };
  walk(sidebar);
  return out;
}
