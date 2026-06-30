/**
 * Mount the @xtandard/flags admin panel INSIDE this Next.js app via an App Router
 * catch-all Route Handler. Every method delegates to a single web-standard
 * `createFetchHandler` — it takes a `Request` and returns a `Response`, which is
 * exactly Next's Route Handler contract, so the glue is one line per verb.
 *
 * `basePath: "/flags"` matches this route's mount point, so the handler strips
 * `/flags` from incoming paths and serves its JSON API + bundled SPA correctly.
 *
 * It writes published snapshots to the SAME runtime dir the OpenFeature provider
 * in `flags.ts` reads (`FLAGS_DATA_DIR`), so a Publish here changes the home page.
 */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createFetchHandler } from "@xtandard/flags";
import { createFileStorage } from "@xtandard/flags/storage/file";

// Source = canonical drafts/history. Runtime = the published snapshots the app
// reads — point it at the same dir `flags.ts` evaluates from.
const SOURCE_DIR = process.env.FLAGS_SOURCE_DIR ?? "./.flags-data/source";
const RUNTIME_DIR = process.env.FLAGS_DATA_DIR ?? "./.flags-data/runtime";

// The handler serves the bundled admin SPA from a directory. By default it
// derives that from `import.meta.url`, but under Next's bundler that URL is
// virtual, so we resolve the package's shipped `dist/ui` explicitly.
//
// Two subtleties:
//   1. Anchor `createRequire` at a real path (`process.cwd()`), NOT
//      `import.meta.url` — the latter is virtual under webpack and resolves the
//      package against a bogus base.
//   2. `realpathSync` the resolved package.json: when developing against a
//      `file:`-linked checkout it's a symlink into a node_modules copy whose
//      `dist/ui` asset links can go stale after a rebuild; following it to the
//      real package root points `dist/ui` at the freshly built bundle.
// If resolution fails for any reason, fall back to the handler's own default.
function resolveUiDir(): string | undefined {
  try {
    const require = createRequire(join(process.cwd(), "package.json"));
    const pkgJson = realpathSync(require.resolve("@xtandard/flags/package.json"));
    return join(dirname(pkgJson), "dist", "ui");
  } catch {
    return undefined;
  }
}
const uiDir = resolveUiDir();

const { fetch: handler } = createFetchHandler({
  basePath: "/flags",
  title: "Flags SDK demo",
  uiDir,
  sourceStorage: createFileStorage({ dir: SOURCE_DIR }),
  runtimeStorage: createFileStorage({ dir: RUNTIME_DIR }),
});

// The handler is the whole panel — API, bundled SPA, and static assets. Run it
// on the Node.js runtime (it touches the filesystem) and never cache responses.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (req: Request): Promise<Response> => handler(req);
export const POST = (req: Request): Promise<Response> => handler(req);
export const PUT = (req: Request): Promise<Response> => handler(req);
export const PATCH = (req: Request): Promise<Response> => handler(req);
export const DELETE = (req: Request): Promise<Response> => handler(req);
