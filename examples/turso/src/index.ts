/**
 * Edge SQLite via libSQL / Turso.
 *
 *   bun add @libsql/client @openfeature/server-sdk @xtandard/flags
 *   bun run src/index.ts                      # local file: db (fully offline)
 *   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… bun run src/index.ts   # remote Turso
 *
 * libSQL speaks the same SQL dialect as SQLite but works against a remote,
 * replicated, edge-distributed database — or a local file / embedded replica. The
 * adapter is the SAME `FlagsStorage` every other backend implements, so the core
 * and the OpenFeature provider don't know or care that the bytes live on the edge.
 *
 * This script seeds a flag, publishes a snapshot, then evaluates it through the
 * OpenFeature provider reading from the SAME libSQL database — proving the whole
 * source → publish → runtime loop over edge SQLite.
 */
import { OpenFeature } from "@openfeature/server-sdk";
import { createFlagsCore } from "@xtandard/flags";
import { createOpenFeatureProvider } from "@xtandard/flags/openfeature";
import { createLibsqlStorage } from "@xtandard/flags/storage/libsql";

// `file:flags.db` is a local libSQL file — works with zero infrastructure. Point
// TURSO_DATABASE_URL at `libsql://<db>-<org>.turso.io` (+ TURSO_AUTH_TOKEN) to run
// the exact same code against a remote, edge-replicated Turso database.
const url = process.env.TURSO_DATABASE_URL ?? "file:flags.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

console.log(`Using libSQL database: ${url}`);

// One database, two logical planes via distinct tables: `source` holds canonical
// drafts/history; `runtime` holds the published snapshots apps read. (For a remote
// Turso deployment you'd typically use two databases or two prefixes; distinct
// tables keep this single-file demo self-contained.)
const sourceStorage = createLibsqlStorage({ url, authToken, table: "flags_source" });
const runtimeStorage = createLibsqlStorage({ url, authToken, table: "flags_runtime" });

// --- 1. Author + publish (source plane). ---
const core = createFlagsCore({ sourceStorage, runtimeStorage });
await core.upsertFlag({
  key: "theme",
  type: "string",
  enabled: true,
  defaultVariant: "light",
  variants: { light: { value: "light" }, dark: { value: "dark" } },
  // Roll "dark" out to everyone in CO; everyone else falls through to light.
  rules: [
    {
      id: "dark-in-colombia",
      name: "dark theme in Colombia",
      conditions: [{ attribute: "country", operator: "equals", value: "CO" }],
      serve: { variant: "dark" },
    },
  ],
  fallthrough: { variant: "light" },
});
const snap = await core.publish({ message: "seed theme flag (turso)" });
console.log(`Published ${snap.version} with flags:`, Object.keys(snap.flags));

// --- 2. Evaluate (runtime plane) through the OpenFeature provider. ---
const provider = createOpenFeatureProvider({ storage: runtimeStorage, refreshIntervalMs: 0 });
await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient();

for (const ctx of [
  { targetingKey: "u1", country: "CO" },
  { targetingKey: "u2", country: "US" },
]) {
  const theme = await client.getStringValue("theme", "light", ctx);
  console.log(`  ${ctx.targetingKey} (country=${ctx.country}) → theme=${theme}`);
}

// Clean up the lazily-created client connections.
await provider.onClose();
sourceStorage.close();
runtimeStorage.close();
